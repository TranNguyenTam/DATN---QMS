namespace Qms.API.Services;

/// <summary>
/// Cron tự chạy đồng bộ ActualMinutes cho WaitEstimateLog mỗi 5 phút —
/// để trang "Đo lường dự báo" luôn có dữ liệu MAE/RMSE vận hành mà không cần
/// bấm nút Sync thủ công. (WaitTimeSyncService là scoped → tạo scope mỗi lần.)
/// </summary>
public class WaitTimeSyncJob : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<WaitTimeSyncJob> _log;
    private const int IntervalMinutes = 5;

    public WaitTimeSyncJob(IServiceProvider services, ILogger<WaitTimeSyncJob> log)
    {
        _services = services;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); // chờ DI/DB sẵn sàng
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var sync = scope.ServiceProvider.GetRequiredService<WaitTimeSyncService>();
                int updated = await sync.RunSyncAsync();
                if (updated > 0)
                    _log.LogInformation("WaitTimeSyncJob: cập nhật {Updated} ActualMinutes", updated);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "WaitTimeSyncJob lỗi (sẽ thử lại lần sau)");
            }
            await Task.Delay(TimeSpan.FromMinutes(IntervalMinutes), stoppingToken);
        }
    }
}
