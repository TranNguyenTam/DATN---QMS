namespace Qms.API.Services;

public record WaitTimeMlPredictResult(
    bool Ok,
    double PredictedMinutes,
    double Confidence,
    string? ModelName,
    string? Error);

public record WaitTimeMlFeatures(
    int QueueLen,
    int QueueType,
    int PhongBanId,
    int PriorityLevel,
    int HourOfDay,
    int DayOfWeek);

public interface IWaitTimeMlClient
{
    Task<WaitTimeMlPredictResult> PredictAsync(WaitTimeMlFeatures features, CancellationToken ct = default);
    Task<bool> IsHealthyAsync(CancellationToken ct = default);
}
