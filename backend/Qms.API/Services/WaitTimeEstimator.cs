using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

/// <summary>
/// Hybrid dự báo thời gian chờ:
///
///   1. Gọi service ML (`ml-wait-time` Python) — nếu OK + confidence ≥ 0.6 → dùng kết quả ML.
///   2. Ngược lại fallback tầng 1 rule-based (EWMA + Weighted Queue Length).
///
/// Mỗi lần dự báo ghi 1 row vào `WaitEstimateLog` (predicted-rule, predicted-ml,
/// confidence, methodUsed, ActualMinutes=NULL). Job `WaitTimeMetricsController.SyncActual`
/// fill ActualMinutes sau khi BN hoàn tất → có dataset đo MAE/RMSE/MAPE.
/// </summary>
public class WaitTimeEstimator : IWaitTimeEstimator
{
    private const double MlConfidenceThreshold = 0.6d;

    private readonly IDatabaseHelper _db;
    private readonly IWaitTimeMlClient _ml;
    private readonly ILogger<WaitTimeEstimator> _log;

    public WaitTimeEstimator(IDatabaseHelper db, IWaitTimeMlClient ml, ILogger<WaitTimeEstimator> log)
    {
        _db = db;
        _ml = ml;
        _log = log;
    }

    public async Task<object> EstimateAsync(int hangDoiId, int priorityWeight)
    {
        if (hangDoiId <= 0)
        {
            return new
            {
                hangDoiId,
                predictedMinutes = 0,
                range = "0-0",
                method = "rule-based-ewma",
                details = new { queueWeighted = 0, activeCounters = 1, serviceAvgMinutes = 0d }
            };
        }

        // Tính tầng 1 rule-based (luôn thực hiện vì cần để fallback + log).
        // activeCounters = số phòng thực phục vụ hàng đợi (chia tải), phongBanRep
        // = phòng đại diện để truyền cho ML (thay vì hardcode 0).
        var (queueCount, ewmaSeconds, activeCounters, phongBanRep) = await ComputeRuleBasedAsync(hangDoiId);
        int weightedQueue = Math.Max(0, queueCount * Math.Max(1, priorityWeight));
        double rulePred = (weightedQueue * ewmaSeconds) / activeCounters / 60d;

        // Thử tầng 2 ML — nếu service down hoặc confidence thấp thì fallback.
        var now = DateTime.Now;
        var mlResult = await _ml.PredictAsync(new WaitTimeMlFeatures(
            QueueLen: queueCount,
            QueueType: hangDoiId,
            PhongBanId: phongBanRep,
            PriorityLevel: priorityWeight,
            HourOfDay: now.Hour,
            DayOfWeek: (int)now.DayOfWeek
        ));

        bool useMl = mlResult.Ok && mlResult.Confidence >= MlConfidenceThreshold;
        double finalPred = useMl ? mlResult.PredictedMinutes : rulePred;
        string methodUsed = useMl ? $"ml-{mlResult.ModelName ?? "unknown"}" : "rule-ewma";

        int lower = Math.Max(0, (int)Math.Floor(finalPred * 0.85d));
        int upper = Math.Max(lower, (int)Math.Ceiling(finalPred * 1.15d));

        // Log để đo lường sau (background, không await).
        _ = LogPredictionAsync(hangDoiId, queueCount, activeCounters, rulePred,
            mlResult.Ok ? (double?)mlResult.PredictedMinutes : null,
            mlResult.Ok ? (double?)mlResult.Confidence : null,
            methodUsed);

        return new
        {
            hangDoiId,
            predictedMinutes = Math.Round(finalPred, 1),
            range = $"{lower}-{upper}",
            method = methodUsed,
            details = new
            {
                queueWeighted = weightedQueue,
                activeCounters,
                serviceAvgMinutes = Math.Round(ewmaSeconds / 60d, 2),
                mlAvailable = mlResult.Ok,
                mlConfidence = mlResult.Ok ? Math.Round(mlResult.Confidence, 3) : (double?)null,
            }
        };
    }

    public async Task<object> EstimatePersonalAsync(int hangDoiId, int stt)
    {
        if (hangDoiId <= 0 || stt <= 0)
        {
            return new
            {
                hangDoiId,
                stt,
                aheadCount = 0,
                waitMinutes = 0,
                estimatedAt = (string?)null,
                currentSTT = (int?)null,
                currentSoThuTuDayDu = (string?)null,
                soThuTuDayDu = (string?)null,
                hangDoiName = (string?)null,
                phongBanName = (string?)null,
                tenBenhNhan = (string?)null,
            };
        }

        // Lấy avg service time + active counters (giống EstimateAsync).
        var (_, ewmaSeconds, activeCounters, _) = await ComputeRuleBasedAsync(hangDoiId);
        // Chặn nhiễu: nếu dữ liệu phục vụ của hàng đợi bất thường (vd seed lỗi),
        // giới hạn thời gian phục vụ trung bình ở mức hợp lý.
        double avgMinutes = Math.Min(ewmaSeconds / 60d, 20d);

        // Đếm BN trước STT này (cùng hàng đợi, ngày hôm nay, chưa NgayGioThucHien, STT < @Stt, không hủy).
        const string aheadSql = @"
SELECT COUNT(*) AS Ahead
FROM HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId
  AND CONVERT(date, NgayGioLaySo) = CONVERT(date, GETDATE())
  AND Huy = 0
  AND BoQua = 0
  AND NgayGioThucHien IS NULL
  AND STT < @Stt;";
        var aheadVal = await _db.ScalarAsync<int>(aheadSql, new { HangDoiId = hangDoiId, Stt = stt });
        int aheadCount = aheadVal;

        // STT đang gọi mới nhất (đã có NgayGioThucHien chưa NgayGioHoanTat).
        const string currentSql = @"
SELECT TOP 1 STT, SoThuTuDayDu
FROM HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId
  AND CONVERT(date, NgayGioLaySo) = CONVERT(date, GETDATE())
  AND Huy = 0
  AND NgayGioThucHien IS NOT NULL
ORDER BY NgayGioThucHien DESC;";
        var currentRow = await _db.OneAsync(currentSql, new { HangDoiId = hangDoiId });
        int? currentVal = null;
        string? currentSoThuTuDayDu = null;
        if (currentRow != null)
        {
            var cd = (IDictionary<string, object>)currentRow;
            currentVal = cd.TryGetValue("STT", out var cs) && cs != null ? Convert.ToInt32(cs) : (int?)null;
            currentSoThuTuDayDu = cd.TryGetValue("SoThuTuDayDu", out var cf) ? cf?.ToString() : null;
        }

        // Tên hàng đợi + tên BN nếu có (BN có thể đã link BenhNhan_Id sau bước xác nhận quầy).
        const string metaSql = @"
SELECT TOP 1
    h.SoThuTuDayDu,
    hd.TenHangDoi,
    pb.TenPhongBan,
    bn.TENBENHNHAN AS TenBenhNhan
FROM HangDoiPhongBan h WITH (NOLOCK)
LEFT JOIN DM_HangDoi hd WITH (NOLOCK) ON h.HangDoi_Id = hd.HangDoi_Id
LEFT JOIN DM_PhongBan pb WITH (NOLOCK) ON h.PhongBan_Id = pb.PhongBan_Id
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK) ON h.BenhNhan_Id = bn.BENHNHAN_ID
WHERE h.HangDoi_Id = @HangDoiId
  AND h.STT = @Stt
  AND CONVERT(date, h.NgayGioLaySo) = CONVERT(date, GETDATE())
  AND h.Huy = 0
ORDER BY h.HangDoiPhongBan_Id DESC;";
        var metaRow = await _db.OneAsync(metaSql, new { HangDoiId = hangDoiId, Stt = stt });
        string? hangDoiName = null, phongBanName = null, tenBenhNhan = null, soThuTuDayDu = null;
        if (metaRow != null)
        {
            var dict = (IDictionary<string, object>)metaRow;
            soThuTuDayDu = dict.TryGetValue("SoThuTuDayDu", out var sd) ? sd?.ToString() : null;
            hangDoiName = dict.TryGetValue("TenHangDoi", out var hd) ? hd?.ToString() : null;
            phongBanName = dict.TryGetValue("TenPhongBan", out var pb) ? pb?.ToString() : null;
            tenBenhNhan = dict.TryGetValue("TenBenhNhan", out var bn) ? bn?.ToString() : null;
        }

        // Chia cho số quầy đang phục vụ (xử lý song song) — nếu có 2 quầy thì
        // chờ thực tế bằng một nửa so với 1 quầy.
        double waitMin = aheadCount * avgMinutes / Math.Max(1, activeCounters);
        var eta = DateTime.Now.AddMinutes(waitMin);

        return new
        {
            hangDoiId,
            stt,
            aheadCount,
            waitMinutes = Math.Round(waitMin, 1),
            avgServiceMinutes = Math.Round(avgMinutes, 2),
            estimatedAt = eta.ToString("yyyy-MM-ddTHH:mm:ss"),
            currentSTT = currentVal,
            currentSoThuTuDayDu,
            soThuTuDayDu,
            hangDoiName,
            phongBanName,
            tenBenhNhan,
        };
    }

    public async Task<object> EstimatePersonalByIdAsync(int hangDoiPhongBanId)
    {
        if (hangDoiPhongBanId <= 0)
            return await EstimatePersonalAsync(0, 0);

        // Tra HangDoi_Id + STT từ khóa chính → dùng lại logic EstimatePersonalAsync
        // (giờ STT là giá trị cột thật, không phải digits của SoThuTuDayDu nên khớp).
        const string sql = @"
SELECT TOP 1 HangDoi_Id, STT, BenhNhan_Id
FROM HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoiPhongBan_Id = @Id AND Huy = 0;";
        var row = await _db.OneAsync(sql, new { Id = hangDoiPhongBanId });
        if (row is null) return await EstimatePersonalAsync(0, 0);

        var d = (IDictionary<string, object>)row;
        int bn = d.TryGetValue("BenhNhan_Id", out var b) && b != null ? Convert.ToInt32(b) : 0;
        // Nếu lượt đã gắn BN (vd lấy số nhanh đã được quầy nhận dạng) → theo cả
        // HÀNH TRÌNH để app tự nhảy sang Khám/CLS/... thay vì kẹt ở bước tiếp nhận.
        if (bn > 0) return await EstimateJourneyByBenhNhanAsync(bn);
        int hangDoiId = d.TryGetValue("HangDoi_Id", out var h) && h != null ? Convert.ToInt32(h) : 0;
        int stt = d.TryGetValue("STT", out var s) && s != null ? Convert.ToInt32(s) : 0;
        return await EstimatePersonalAsync(hangDoiId, stt);
    }

    public async Task<object> EstimateJourneyByBenhNhanAsync(int benhNhanId)
    {
        if (benhNhanId <= 0) return await EstimatePersonalAsync(0, 0);
        // Bước hiện tại của BN trong ngày = bản ghi CHƯA hoàn tất, mới nhất.
        const string sql = @"
SELECT TOP 1 HangDoi_Id, STT, ISNULL(TinhTrang, 0) AS TinhTrang
FROM HangDoiPhongBan WITH (NOLOCK)
WHERE BenhNhan_Id = @Bn AND CONVERT(date, NgayGioLaySo) = CONVERT(date, GETDATE())
  AND Huy = 0 AND NgayGioHoanTat IS NULL
ORDER BY HangDoiPhongBan_Id DESC;";
        var row = await _db.OneAsync(sql, new { Bn = benhNhanId });
        if (row is null) return await EstimatePersonalAsync(0, 0); // hết bước / đã hoàn tất
        var d = (IDictionary<string, object>)row;
        int hangDoiId = d.TryGetValue("HangDoi_Id", out var h) && h != null ? Convert.ToInt32(h) : 0;
        int stt = d.TryGetValue("STT", out var s) && s != null ? Convert.ToInt32(s) : 0;
        int tinhTrang = d.TryGetValue("TinhTrang", out var t) && t != null ? Convert.ToInt32(t) : 0;

        // ── ĐÃ HOÀN TẤT QUY TRÌNH: BN tới BƯỚC CUỐI và đã được GỌI (TinhTrang>=1).
        //    EstimatePersonalAsync(0,0) → response không có hangDoiName → FE hiện màn
        //    "Đã hoàn tất". (Bước cuối = Nhà thuốc nếu có thuốc, hoặc Viện phí nếu không.)
        //   • Nhà thuốc (HĐ5) được gọi → lấy thuốc là chặng cuối.
        if (hangDoiId == 5 && tinhTrang >= 1)
            return await EstimatePersonalAsync(0, 0);
        //   • Viện phí (HĐ4) được gọi + KHÔNG có đơn thuốc hôm nay → VP là chặng cuối.
        if (hangDoiId == 4 && tinhTrang >= 1)
        {
            bool coThuoc = await _db.ScalarAsync<int>(@"
SELECT COUNT(*) FROM dbo.KB_DonThuoc WITH (NOLOCK)
WHERE BenhNhan_Id = @Bn AND CONVERT(date, NgayKe) = CONVERT(date, GETDATE())
  AND (TrangThai IS NULL OR TrangThai <> N'Huy')", new { Bn = benhNhanId }) > 0;
            if (!coThuoc) return await EstimatePersonalAsync(0, 0);
        }

        // Gọi THẲNG EstimatePersonalAsync (không qua ByIdAsync) — tránh đệ quy vô hạn
        // khi bản ghi bước hiện tại cũng có BenhNhan_Id.
        return await EstimatePersonalAsync(hangDoiId, stt);
    }

    private async Task<(int queueCount, double ewmaSeconds, int activeCounters, int phongBanId)> ComputeRuleBasedAsync(int hangDoiId)
    {
        // Đếm trực tiếp HangDoiPhongBan thay vì gọi SP_004 'HangDoiTiepNhanDangCho'
        // (action đó trả về 1 row text concat tên top-3 BN → .Count() luôn = 1 → bug
        // queueLen không phản ứng khi có thêm BN lấy số).
        const string countSql = @"
SELECT COUNT(*) FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId
  AND NgayThucHien = CONVERT(date, GETDATE())
  AND Huy = 0
  AND ISNULL(BoQua, 0) = 0
  AND TinhTrang = 0;";
        int queueCount = await _db.ScalarAsync<int>(countSql, new { HangDoiId = hangDoiId });

        // Số quầy/phòng đang phục vụ hàng đợi này hôm nay (≥1) → chia tải rule-based.
        int activeCounters = await _db.ScalarAsync<int>(@"
SELECT COUNT(DISTINCT PhongBan_Id) FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId AND NgayThucHien = CONVERT(date, GETDATE())
  AND Huy = 0 AND PhongBan_Id IS NOT NULL;", new { HangDoiId = hangDoiId });
        if (activeCounters < 1) activeCounters = 1;

        // Phòng đại diện (đông BN nhất hôm nay) → truyền cho ML thay vì hardcode 0.
        int phongBanId = await _db.ScalarAsync<int>(@"
SELECT TOP 1 PhongBan_Id FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId AND NgayThucHien = CONVERT(date, GETDATE())
  AND Huy = 0 AND PhongBan_Id IS NOT NULL
GROUP BY PhongBan_Id ORDER BY COUNT(*) DESC;", new { HangDoiId = hangDoiId });

        const string ewmaSql = """
            SELECT TOP 50
                DATEDIFF(SECOND, TRY_CONVERT(datetime, NgayGioThucHien), TRY_CONVERT(datetime, NgayGioHoanTat)) AS ServiceSeconds
            FROM HangDoiPhongBan WITH (NOLOCK)
            WHERE HangDoi_Id = @HangDoiId
              AND NgayGioThucHien IS NOT NULL
              AND NgayGioHoanTat IS NOT NULL
              AND Huy = 0
            ORDER BY HangDoiPhongBan_Id DESC
            """;

        var serviceRows = await _db.ListAsync(ewmaSql, new { HangDoiId = hangDoiId });
        double ewmaSeconds = 300d;
        const double alpha = 0.3d;

        foreach (var row in serviceRows)
        {
            var d = (IDictionary<string, object>)row;
            if (!d.TryGetValue("ServiceSeconds", out var value) || value == null) continue;
            var sample = Convert.ToDouble(value);
            if (sample <= 0 || sample > 7200) continue;
            ewmaSeconds = alpha * sample + (1 - alpha) * ewmaSeconds;
        }

        return (queueCount, ewmaSeconds, activeCounters, phongBanId);
    }

    private async Task LogPredictionAsync(
        int hangDoiId, int queueLen, int activeCounters,
        double rulePred, double? mlPred, double? mlConf, string method)
    {
        const string sql = @"
INSERT INTO dbo.WaitEstimateLog
    (HangDoi_Id, QueueLen, ActiveCounters,
     PredictedMinutesRule, PredictedMinutesMl, MlConfidence, MethodUsed)
VALUES
    (@HangDoiId, @QueueLen, @ActiveCounters,
     @RulePred, @MlPred, @MlConf, @Method);";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                HangDoiId = hangDoiId,
                QueueLen = queueLen,
                ActiveCounters = activeCounters,
                RulePred = Math.Round(rulePred, 2),
                MlPred = mlPred is null ? (double?)null : Math.Round(mlPred.Value, 2),
                MlConf = mlConf is null ? (double?)null : Math.Round(mlConf.Value, 3),
                Method = method,
            });
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "WaitEstimateLog insert failed");
        }
    }
}
