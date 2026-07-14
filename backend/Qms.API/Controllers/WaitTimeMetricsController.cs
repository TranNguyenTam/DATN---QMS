using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Controllers;

/// <summary>
/// Quản lý dataset đo lường cho module dự báo thời gian chờ.
///
/// 1. POST /sync-actual: cập nhật cột ActualMinutes cho các row trong WaitEstimateLog
///    chưa có ActualMinutes — match qua HangDoiPhongBan đã hoàn tất theo cùng HangDoi_Id.
///    Có thể gọi định kỳ qua cron 5 phút/lần.
///
/// 2. GET /metrics: trả về MAE / RMSE / MAPE / over10min cho dataset hiện có.
/// </summary>
[ApiController]
[Route("api/v1/wait-time-metrics")]
[Authorize]
public class WaitTimeMetricsController : ControllerBase
{
    private readonly IDatabaseHelper _db;
    private readonly WaitTimeSyncService _sync;
    private readonly ILogger<WaitTimeMetricsController> _log;

    public WaitTimeMetricsController(IDatabaseHelper db, WaitTimeSyncService sync, ILogger<WaitTimeMetricsController> log)
    {
        _db = db;
        _sync = sync;
        _log = log;
    }

    // POST /sync-actual — fill ActualMinutes (dùng chung logic với cron WaitTimeSyncJob).
    [HttpPost("sync-actual")]
    public async Task<ActionResult<ApiResponseDto<object>>> SyncActual()
    {
        try
        {
            int updated = await _sync.RunSyncAsync();
            return Ok(new ApiResponseDto<object>(new { ok = true, updated }));
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "SyncActual failed");
            return Ok(new ApiResponseDto<object>(new { ok = false, message = ex.Message }));
        }
    }

    [HttpGet("metrics")]
    public async Task<ActionResult<ApiResponseDto<object>>> Metrics([FromQuery] int days = 7)
    {
        // Đo theo dự báo ĐÃ PHỤC VỤ người dùng: dùng PredictedMinutesMl nếu
        // lượt đó dùng ML (MethodUsed = 'ml-...'), ngược lại dùng rule.
        const string sql = @"
WITH d AS (
    SELECT
        served = COALESCE(
            CASE WHEN MethodUsed LIKE 'ml-%' THEN PredictedMinutesMl ELSE PredictedMinutesRule END,
            PredictedMinutesRule),
        ActualMinutes
    FROM dbo.WaitEstimateLog
    WHERE ActualMinutes IS NOT NULL
      AND CreatedAt >= DATEADD(DAY, -@Days, SYSUTCDATETIME())
), e AS (
    SELECT
        ABS(served - ActualMinutes) AS err,
        CASE WHEN ActualMinutes > 0
             THEN 100.0 * ABS(served - ActualMinutes) / ActualMinutes
             ELSE NULL END AS pctErr
    FROM d
    WHERE served IS NOT NULL
)
SELECT
    COUNT(*)                                            AS samples,
    AVG(CAST(err AS FLOAT))                             AS mae,
    SQRT(AVG(CAST(err * err AS FLOAT)))                 AS rmse,
    AVG(pctErr)                                         AS mape,
    SUM(CASE WHEN err > 10 THEN 1 ELSE 0 END) * 100.0 /
        NULLIF(COUNT(*), 0)                             AS over10minPct
FROM e;";
        var row = await _db.OneAsync(sql, new { Days = days });
        return Ok(new ApiResponseDto<object>(row ?? new { samples = 0 }));
    }

    [HttpGet("logs")]
    public async Task<ActionResult<ApiResponseDto<object>>> Logs(
        [FromQuery] int limit = 100,
        [FromQuery] bool onlyActual = false)
    {
        // onlyActual = chỉ log đã có ActualMinutes (cho biểu đồ Predicted vs Actual).
        // Dự báo mới cho BN đang chờ chưa có actual → nằm ngoài "N bản ghi mới nhất";
        // lọc trực tiếp ở SQL để biểu đồ luôn hiển thị cặp dự báo–thực tế gần nhất.
        string sql = @"
SELECT TOP (@Limit)
    Id, HangDoi_Id, QueueLen, ActiveCounters,
    PredictedMinutesRule, PredictedMinutesMl, MlConfidence,
    MethodUsed, ActualMinutes,
    CreatedAt, CompletedAt
FROM dbo.WaitEstimateLog "
            + (onlyActual ? "WHERE ActualMinutes IS NOT NULL " : "")
            + "ORDER BY Id DESC;";
        var rows = await _db.ListAsync(sql, new { Limit = limit });
        return Ok(new ApiResponseDto<object>(rows));
    }
}
