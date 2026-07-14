namespace Qms.API.Services;

/// <summary>
/// Cron đẩy Web Push cho cổng theo dõi BN — quét subscription mỗi 20 giây và
/// gửi thông báo khi tới trạng thái mới (sắp tới lượt / đến lượt / quá lượt /
/// chuyển hàng đợi). PushNotificationService là scoped → tạo scope mỗi vòng.
/// </summary>
public class PushNotifierJob : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<PushNotifierJob> _log;
    private const int IntervalSeconds = 20;

    public PushNotifierJob(IServiceProvider services, ILogger<PushNotifierJob> log)
    {
        _services = services;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken); // chờ DI/DB sẵn sàng
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<PushNotificationService>();
                int sent = await svc.RunSendAsync();
                if (sent > 0)
                    _log.LogInformation("PushNotifierJob: đã đẩy {Sent} thông báo", sent);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "PushNotifierJob lỗi (sẽ thử lại lần sau)");
            }
            await Task.Delay(TimeSpan.FromSeconds(IntervalSeconds), stoppingToken);
        }
    }
}
