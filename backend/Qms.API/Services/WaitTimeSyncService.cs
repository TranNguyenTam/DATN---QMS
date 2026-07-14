using System.Collections.Generic;
using System.Threading.Tasks;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

/// <summary>
/// Đồng bộ ActualMinutes cho WaitEstimateLog: với mỗi dự báo (ActualMinutes
/// NULL), tìm lượt BN HOÀN TẤT gần nhất cùng HangDoi_Id và lấy thời gian chờ
/// thực tế = DATEDIFF(NgayGioLaySo → NgayGioHoanTat). Dùng chung cho cả
/// endpoint /sync-actual lẫn cron WaitTimeSyncJob.
///
/// LƯU Ý 2 bug đã sửa so với bản cũ:
///   1. Cột match đúng là NgayGioLaySo (không phải NgayGioTao — cột không tồn tại).
///   2. WaitEstimateLog.CreatedAt lưu UTC (SYSUTCDATETIME) còn NgayGioLaySo là
///      giờ local → quy CreatedAt về local (@Tz) trước khi so khớp cửa sổ thời gian.
/// </summary>
public class WaitTimeSyncService
{
    private readonly IDatabaseHelper _db;
    public WaitTimeSyncService(IDatabaseHelper db) => _db = db;

    private const string SyncSql = @"
DECLARE @Tz int = DATEDIFF(HOUR, GETUTCDATE(), GETDATE());
UPDATE w
SET w.ActualMinutes      = m.actual,
    w.HangDoiPhongBan_Id = m.HangDoiPhongBan_Id,
    w.CompletedAt        = m.NgayGioHoanTat
FROM dbo.WaitEstimateLog w
CROSS APPLY (
    SELECT TOP 1
        h.HangDoiPhongBan_Id,
        DATEDIFF(MINUTE, TRY_CONVERT(datetime, h.NgayGioLaySo),
                         TRY_CONVERT(datetime, h.NgayGioHoanTat)) AS actual,
        TRY_CONVERT(datetime, h.NgayGioHoanTat) AS NgayGioHoanTat
    FROM dbo.HangDoiPhongBan h WITH (NOLOCK)
    WHERE h.HangDoi_Id = w.HangDoi_Id
      AND h.Huy = 0
      AND h.NgayGioLaySo  IS NOT NULL
      AND h.NgayGioHoanTat IS NOT NULL
      AND DATEDIFF(MINUTE, TRY_CONVERT(datetime, h.NgayGioLaySo),
                           TRY_CONVERT(datetime, h.NgayGioHoanTat)) BETWEEN 1 AND 240
      AND TRY_CONVERT(datetime, h.NgayGioLaySo) >= DATEADD(HOUR, -1, DATEADD(HOUR, @Tz, w.CreatedAt))
      AND TRY_CONVERT(datetime, h.NgayGioLaySo) <= DATEADD(HOUR,  4, DATEADD(HOUR, @Tz, w.CreatedAt))
    ORDER BY ABS(DATEDIFF(SECOND, TRY_CONVERT(datetime, h.NgayGioLaySo),
                                  DATEADD(HOUR, @Tz, w.CreatedAt)))
) m
WHERE w.ActualMinutes IS NULL;
SELECT @@ROWCOUNT AS updated;";

    /// <summary>Chạy đồng bộ, trả số dòng được cập nhật ActualMinutes.</summary>
    public async Task<int> RunSyncAsync()
    {
        var row = await _db.OneAsync(SyncSql);
        return row is IDictionary<string, object> d && d.TryGetValue("updated", out var v) && v != null
            ? System.Convert.ToInt32(v)
            : 0;
    }
}
