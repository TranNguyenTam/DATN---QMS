using System.Text.Json;
using Qms.Infrastructure.Utils;
using WebPush;

namespace Qms.API.Services;

/// <summary>
/// Web Push cho cổng theo dõi BN. Lưu subscription + đẩy thông báo theo máy
/// trạng thái: prewarn (sắp tới ~N người) → called (đến lượt) → skipped (quá lượt,
/// cấp số mới). Hỗ trợ theo 1 bước (HangDoiPhongBan_Id) HOẶC cả hành trình
/// (BenhNhan_Id) — tự nhảy hàng đợi và báo khi chuyển bước (khám → CLS → ...).
/// </summary>
public class PushNotificationService
{
    private readonly IDatabaseHelper _db;
    private readonly ILogger<PushNotificationService> _log;
    private readonly WebPushClient _client = new();
    private readonly VapidDetails? _vapid;
    private readonly int _prewarn;
    public string PublicKey { get; }

    public PushNotificationService(IDatabaseHelper db, IConfiguration cfg, ILogger<PushNotificationService> log)
    {
        _db = db;
        _log = log;
        PublicKey = cfg["WebPush:PublicKey"] ?? "";
        var priv = cfg["WebPush:PrivateKey"] ?? "";
        var subject = cfg["WebPush:Subject"] ?? "mailto:admin@example.com";
        _prewarn = int.TryParse(cfg["WebPush:PrewarnThreshold"], out var t) ? t : 3;
        if (!string.IsNullOrWhiteSpace(PublicKey) && !string.IsNullOrWhiteSpace(priv))
            _vapid = new VapidDetails(subject, PublicKey, priv);
    }

    /// <summary>Lưu/cập nhật 1 subscription (upsert theo Endpoint + mục tiêu).</summary>
    public Task SaveAsync(string endpoint, string p256dh, string auth, int hangDoiPhongBanId, int benhNhanId)
    {
        const string sql = @"
MERGE dbo.PushSubscription AS t
USING (SELECT @Endpoint AS E, @Hd AS H, @Bn AS B) AS s
ON t.Endpoint = s.E AND t.HangDoiPhongBan_Id = s.H AND t.BenhNhan_Id = s.B
WHEN MATCHED THEN UPDATE SET P256dh=@P256dh, Auth=@Auth, Active=1,
    Stage=NULL, LastStt=NULL, LastHangDoiId=NULL, UpdatedAt=GETDATE()
WHEN NOT MATCHED THEN INSERT (Endpoint, P256dh, Auth, HangDoiPhongBan_Id, BenhNhan_Id)
    VALUES (@Endpoint, @P256dh, @Auth, @Hd, @Bn);";
        return _db.ExecuteAsync(sql, new
        {
            Endpoint = endpoint,
            P256dh = p256dh,
            Auth = auth,
            Hd = hangDoiPhongBanId,
            Bn = benhNhanId
        });
    }

    /// <summary>Quét toàn bộ subscription đang active, đẩy thông báo khi tới trạng thái mới.</summary>
    public async Task<int> RunSendAsync()
    {
        if (_vapid is null) return 0; // chưa cấu hình VAPID private key
        var subs = await _db.ListAsync(@"
SELECT Id, Endpoint, P256dh, Auth, HangDoiPhongBan_Id AS Hd, BenhNhan_Id AS Bn,
       Stage, LastStt, LastHangDoiId
FROM dbo.PushSubscription WITH (NOLOCK) WHERE Active = 1");

        int sent = 0;
        foreach (var srow in subs)
        {
            var s = (IDictionary<string, object>)srow;
            int subId = Convert.ToInt32(s["Id"]);
            int hd = Convert.ToInt32(s["Hd"]);
            int bn = Convert.ToInt32(s["Bn"]);
            string? stage = s["Stage"] as string;
            int? lastStt = s["LastStt"] is null ? null : Convert.ToInt32(s["LastStt"]);
            int? lastHd = s["LastHangDoiId"] is null ? null : Convert.ToInt32(s["LastHangDoiId"]);

            try
            {
                var row = bn > 0 ? await ResolveJourneyAsync(bn) : await ResolveStepAsync(hd);
                if (row is null)
                {
                    // Hành trình đã xong tất cả các bước → báo hoàn tất 1 lần rồi tắt.
                    if (bn > 0 && stage != null && stage != "done")
                        await TrySendAsync(s, "Hoàn tất",
                            "Bạn đã hoàn tất các bước khám hôm nay. Cảm ơn!", "/track?bn=" + bn);
                    await DeactivateAsync(subId);
                    continue;
                }

                var r = (IDictionary<string, object>)row;
                int curHd = Convert.ToInt32(r["HangDoi_Id"]);
                int stt = Convert.ToInt32(r["STT"]);
                string name = (r["TenHangDoi"] as string) ?? "hàng đợi";
                bool served = r["NgayGioThucHien"] != null;
                bool done = r["NgayGioHoanTat"] != null;
                bool boqua = r["BoQua"] != null && Convert.ToInt32(r["BoQua"]) == 1;
                string url = bn > 0 ? "/track?bn=" + bn : "/track?id=" + hd;

                // Track 1 bước: bước hoàn tất → kết thúc theo dõi.
                if (bn == 0 && done) { await DeactivateAsync(subId); continue; }

                string? title = null, body = null;
                string newStage = stage ?? "pending";
                bool queueChanged = lastHd.HasValue && lastHd.Value != 0 && lastHd.Value != curHd;

                if (queueChanged)
                {
                    title = "Chuyển hàng đợi";
                    body = $"Bạn đã chuyển sang {name} — số {stt}.";
                    newStage = "pending";
                }
                else if (served)
                {
                    if (stage != "called")
                    {
                        title = "Đến lượt bạn!";
                        body = $"Mời bạn vào {name} (số {stt}).";
                        newStage = "called";
                    }
                }
                else if (boqua && lastStt != stt)
                {
                    title = "Bạn đã quá lượt";
                    body = $"Bạn được xếp lại số {stt} ở {name}. Vui lòng chờ gọi lại.";
                    newStage = "skipped";
                }
                else
                {
                    int ahead = await AheadAsync(curHd, stt);
                    if (ahead <= _prewarn && stage != "prewarn" && stage != "called")
                    {
                        title = "Sắp đến lượt bạn";
                        body = ahead <= 0
                            ? $"Sắp tới lượt của bạn ở {name}. Vui lòng quay lại."
                            : $"Còn {ahead} người trước bạn ở {name}. Vui lòng quay lại quầy.";
                        newStage = "prewarn";
                    }
                }

                if (title != null)
                {
                    bool ok = await TrySendAsync(s, title, body!, url);
                    if (!ok) { await DeactivateAsync(subId); continue; } // hết hạn
                    sent++;
                }
                await UpdateStateAsync(subId, newStage, stt, curHd);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Push lỗi (sub {Id})", subId);
            }
        }
        return sent;
    }

    private Task<dynamic?> ResolveStepAsync(int hd) => _db.OneAsync(@"
SELECT TOP 1 h.HangDoi_Id, h.STT, h.NgayGioThucHien, h.NgayGioHoanTat, h.BoQua, hd.TenHangDoi
FROM HangDoiPhongBan h WITH (NOLOCK)
LEFT JOIN DM_HangDoi hd WITH (NOLOCK) ON h.HangDoi_Id = hd.HangDoi_Id
WHERE h.HangDoiPhongBan_Id = @Id", new { Id = hd });

    private Task<dynamic?> ResolveJourneyAsync(int bn) => _db.OneAsync(@"
SELECT TOP 1 h.HangDoi_Id, h.STT, h.NgayGioThucHien, h.NgayGioHoanTat, h.BoQua, hd.TenHangDoi
FROM HangDoiPhongBan h WITH (NOLOCK)
LEFT JOIN DM_HangDoi hd WITH (NOLOCK) ON h.HangDoi_Id = hd.HangDoi_Id
WHERE h.BenhNhan_Id = @Bn AND CONVERT(date, h.NgayGioLaySo) = CONVERT(date, GETDATE())
  AND h.Huy = 0 AND h.NgayGioHoanTat IS NULL
ORDER BY h.HangDoiPhongBan_Id DESC", new { Bn = bn });

    private async Task<int> AheadAsync(int hd, int stt)
    {
        var n = await _db.ScalarAsync<int>(@"
SELECT COUNT(*) FROM HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id=@Hd AND CONVERT(date,NgayGioLaySo)=CONVERT(date,GETDATE())
  AND Huy=0 AND ISNULL(BoQua,0)=0 AND NgayGioThucHien IS NULL AND STT < @Stt",
            new { Hd = hd, Stt = stt });
        return n;
    }

    private async Task<bool> TrySendAsync(IDictionary<string, object> s, string title, string body, string url)
    {
        var payload = JsonSerializer.Serialize(new { title, body, url });
        try
        {
            await _client.SendNotificationAsync(
                new PushSubscription(s["Endpoint"].ToString(), s["P256dh"].ToString(), s["Auth"].ToString()),
                payload, _vapid);
            return true;
        }
        catch (WebPushException ex)
        {
            int code = (int)ex.StatusCode;
            if (code == 404 || code == 410) return false; // subscription hết hạn → tắt
            _log.LogWarning(ex, "Push HTTP {Code}", code);
            return true; // lỗi tạm thời → giữ lại
        }
    }

    private Task UpdateStateAsync(int id, string stage, int stt, int hd) => _db.ExecuteAsync(
        "UPDATE dbo.PushSubscription SET Stage=@Stage, LastStt=@Stt, LastHangDoiId=@Hd, UpdatedAt=GETDATE() WHERE Id=@Id",
        new { Id = id, Stage = stage, Stt = stt, Hd = hd });

    private Task DeactivateAsync(int id) => _db.ExecuteAsync(
        "UPDATE dbo.PushSubscription SET Active=0, UpdatedAt=GETDATE() WHERE Id=@Id", new { Id = id });
}
