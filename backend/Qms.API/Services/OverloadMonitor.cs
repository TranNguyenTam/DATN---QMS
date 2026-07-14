using Microsoft.AspNetCore.SignalR;
using Qms.API.Hubs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

/// <summary>
/// BackgroundService chạy mỗi 60 giây — đếm số BN đang chờ ở mỗi hàng đợi,
/// nếu vượt ngưỡng (mặc định 10) thì push SignalR event `OverloadAlert` để
/// Dashboard / Tivi cập nhật ngay (thay vì đợi poll).
///
/// Chỉ push khi tập "hàng đợi quá tải" THAY ĐỔI so với lần check trước, để
/// tránh spam.
/// </summary>
public class OverloadMonitor : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly IHubContext<QueueHub> _hub;
    private readonly ILogger<OverloadMonitor> _log;
    private const int Threshold = 10;
    private const int CheckIntervalSeconds = 60;

    private string _lastSnapshot = string.Empty;

    public OverloadMonitor(
        IServiceProvider services,
        IHubContext<QueueHub> hub,
        ILogger<OverloadMonitor> log)
    {
        _services = services;
        _hub = hub;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Đợi 5s đầu để DI / DB sẵn sàng.
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckOnceAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "OverloadMonitor check failed (sẽ thử lại lần sau)");
            }
            await Task.Delay(TimeSpan.FromSeconds(CheckIntervalSeconds), stoppingToken);
        }
    }

    private async Task CheckOnceAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDatabaseHelper>();

        const string sql = @"
SELECT
    HangDoi_Id  AS hangDoiId,
    PhongBan_Id AS phongBanId,
    COUNT(*)    AS waiting
FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE Huy = 0
  AND NgayGioThucHien IS NULL
  AND NgayGioHoanTat  IS NULL
GROUP BY HangDoi_Id, PhongBan_Id
HAVING COUNT(*) >= @T
ORDER BY waiting DESC;";

        var rows = (await db.ListAsync(sql, new { T = Threshold })).ToList();

        // Ký hiệu snapshot để so sánh — tránh spam khi không có thay đổi.
        var snapshot = string.Join(
            "|",
            rows.Select(r =>
            {
                var d = (IDictionary<string, object>)r;
                return $"{d["hangDoiId"]}-{d["phongBanId"]}-{d["waiting"]}";
            }));

        if (snapshot == _lastSnapshot) return;
        _lastSnapshot = snapshot;

        await _hub.Clients.All.SendAsync("OverloadAlert", new
        {
            threshold = Threshold,
            count = rows.Count,
            overloaded = rows,
            checkedAt = DateTime.UtcNow,
        }, ct);

        _log.LogInformation("Overload pushed: {Count} hàng đợi vượt ngưỡng {Threshold}",
            rows.Count, Threshold);
    }
}
