using System.Net.Http.Json;
using System.Text.Json;

namespace Qms.API.Services;

/// <summary>
/// Gọi service Python `ml-wait-time` (FastAPI) ở cổng 5011.
/// Cấu hình `WaitTimeMl:BaseUrl`. Service tự fallback an toàn khi chưa wired.
/// </summary>
public class WaitTimeMlClient : IWaitTimeMlClient
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<WaitTimeMlClient> _log;

    public WaitTimeMlClient(IHttpClientFactory httpFactory, IConfiguration config, ILogger<WaitTimeMlClient> log)
    {
        _httpFactory = httpFactory;
        _config = config;
        _log = log;
    }

    private string BaseUrl => (_config["WaitTimeMl:BaseUrl"] ?? "http://localhost:5011").TrimEnd('/');

    public async Task<bool> IsHealthyAsync(CancellationToken ct = default)
    {
        try
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            var res = await client.GetAsync(BaseUrl + "/health", ct);
            if (!res.IsSuccessStatusCode) return false;
            var body = await res.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("ok", out var ok) && ok.GetBoolean();
        }
        catch
        {
            return false;
        }
    }

    public async Task<WaitTimeMlPredictResult> PredictAsync(WaitTimeMlFeatures f, CancellationToken ct = default)
    {
        try
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            var res = await client.PostAsJsonAsync(
                BaseUrl + "/predict",
                new
                {
                    features = new
                    {
                        queueLen = f.QueueLen,
                        queueType = f.QueueType,
                        phongBanId = f.PhongBanId,
                        priorityLevel = f.PriorityLevel,
                        hourOfDay = f.HourOfDay,
                        dayOfWeek = f.DayOfWeek,
                    },
                },
                ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                return new WaitTimeMlPredictResult(false, 0, 0, null, body);
            }
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            return new WaitTimeMlPredictResult(
                Ok: true,
                PredictedMinutes: root.TryGetProperty("predictedMinutes", out var pm) ? pm.GetDouble() : 0,
                Confidence: root.TryGetProperty("confidence", out var cf) ? cf.GetDouble() : 0,
                ModelName: root.TryGetProperty("model", out var m) ? m.GetString() : null,
                Error: null);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "WaitTimeMl predict failed (sẽ fallback rule-based)");
            return new WaitTimeMlPredictResult(false, 0, 0, null, ex.Message);
        }
    }
}
