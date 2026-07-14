using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Controllers;

/// <summary>
/// Dashboard KPI vận hành theo mục 5 đề cương — "Dashboard KPI hỗ trợ theo dõi
/// thời gian chờ, mức quá tải và hiệu quả điều phối".
///
/// Các endpoint chia nhỏ để FE gọi song song:
///   /summary       tổng hợp số BN, avg wait, số quầy active cho hôm nay
///   /throughput    bucket theo giờ 0..23 cho biểu đồ
///   /queue-status  snapshot hàng đợi đang chờ theo từng HangDoi
///   /overload      hàng đợi đang vượt ngưỡng (cảnh báo)
///   /face-health   trạng thái ai-face + thống kê enroll/identify audit
/// </summary>
[ApiController]
[Route("api/v1/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IDatabaseHelper _db;

    public DashboardController(IDatabaseHelper db)
    {
        _db = db;
    }

    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponseDto<object>>> Summary([FromQuery] DateTime? date)
    {
        var d = (date ?? DateTime.Today).Date;

        const string sql = @"
DECLARE @dFrom datetime = @d, @dTo datetime = DATEADD(DAY, 1, @d);

WITH today AS (
    SELECT *
    FROM dbo.HangDoiPhongBan WITH (NOLOCK)
    WHERE Huy = 0
      AND TRY_CONVERT(datetime, NgayGioLaySo) >= @dFrom
      AND TRY_CONVERT(datetime, NgayGioLaySo) <  @dTo
)
SELECT
    (SELECT COUNT(*) FROM today)                                           AS total,
    (SELECT COUNT(*) FROM today WHERE NgayGioThucHien IS NOT NULL)         AS called,
    (SELECT COUNT(*) FROM today WHERE NgayGioHoanTat IS NOT NULL)          AS completed,
    (SELECT COUNT(*) FROM today WHERE NgayGioThucHien IS NULL
                                  AND NgayGioHoanTat IS NULL)              AS waiting,
    (SELECT COUNT(DISTINCT PhongBan_Id) FROM today
      WHERE NgayGioThucHien IS NOT NULL
        AND NgayGioHoanTat IS NULL)                                        AS activeCounters,
    (SELECT AVG(CAST(DATEDIFF(SECOND,
                              TRY_CONVERT(datetime, NgayGioLaySo),
                              TRY_CONVERT(datetime, NgayGioHoanTat)) AS BIGINT))
         FROM today
         WHERE NgayGioHoanTat IS NOT NULL
           AND DATEDIFF(SECOND,
                        TRY_CONVERT(datetime, NgayGioLaySo),
                        TRY_CONVERT(datetime, NgayGioHoanTat)) BETWEEN 1 AND 7200) AS avgServeSeconds;
";
        var row = await _db.OneAsync(sql, new { d });
        var dict = row as IDictionary<string, object>;

        int Get(string key) => dict is not null && dict.TryGetValue(key, out var v) && v is not null
            ? Convert.ToInt32(v) : 0;
        double GetDouble(string key) => dict is not null && dict.TryGetValue(key, out var v) && v is not null
            ? Convert.ToDouble(v) : 0d;

        return Ok(new ApiResponseDto<object>(new
        {
            date = d.ToString("yyyy-MM-dd"),
            total = Get("total"),
            called = Get("called"),
            completed = Get("completed"),
            waiting = Get("waiting"),
            activeCounters = Get("activeCounters"),
            avgServeMinutes = Math.Round(GetDouble("avgServeSeconds") / 60d, 1),
        }));
    }

    [HttpGet("throughput")]
    public async Task<ActionResult<ApiResponseDto<object>>> Throughput([FromQuery] DateTime? date)
    {
        var d = (date ?? DateTime.Today).Date;
        const string sql = @"
DECLARE @dFrom datetime = @d, @dTo datetime = DATEADD(DAY, 1, @d);

SELECT DATEPART(HOUR, TRY_CONVERT(datetime, NgayGioLaySo)) AS hour,
       COUNT(*)                                          AS issued,
       SUM(CASE WHEN NgayGioHoanTat IS NOT NULL THEN 1 ELSE 0 END) AS completed,
       AVG(CASE WHEN NgayGioHoanTat IS NOT NULL
                THEN DATEDIFF(SECOND,
                              TRY_CONVERT(datetime, NgayGioLaySo),
                              TRY_CONVERT(datetime, NgayGioHoanTat))
                ELSE NULL END)                           AS avgWaitSeconds
FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE Huy = 0
  AND TRY_CONVERT(datetime, NgayGioLaySo) >= @dFrom
  AND TRY_CONVERT(datetime, NgayGioLaySo) <  @dTo
GROUP BY DATEPART(HOUR, TRY_CONVERT(datetime, NgayGioLaySo))
ORDER BY hour;";
        var rows = (await _db.ListAsync(sql, new { d })).ToList();
        var shaped = rows.Select(r =>
        {
            var dict = (IDictionary<string, object>)r;
            var secs = dict.TryGetValue("avgWaitSeconds", out var v) && v is not null
                ? Convert.ToDouble(v) : 0d;
            return new
            {
                hour = Convert.ToInt32(dict["hour"]),
                issued = Convert.ToInt32(dict["issued"]),
                completed = Convert.ToInt32(dict["completed"]),
                avgWaitMinutes = Math.Round(secs / 60d, 1),
            };
        });
        return Ok(new ApiResponseDto<object>(shaped));
    }

    [HttpGet("queue-status")]
    public async Task<ActionResult<ApiResponseDto<object>>> QueueStatus()
    {
        const string sql = @"
SELECT
    hd.HangDoi_Id                AS hangDoiId,
    hd.PhongBan_Id               AS phongBanId,
    COUNT(*)                     AS waiting,
    MIN(TRY_CONVERT(datetime, hd.NgayGioLaySo)) AS oldestTakeAt
FROM dbo.HangDoiPhongBan hd WITH (NOLOCK)
WHERE hd.Huy = 0
  AND hd.NgayGioThucHien IS NULL
  AND hd.NgayGioHoanTat  IS NULL
  AND CONVERT(date, hd.NgayThucHien) = CONVERT(date, GETDATE())
GROUP BY hd.HangDoi_Id, hd.PhongBan_Id
ORDER BY waiting DESC;";
        var rows = (await _db.ListAsync(sql)).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    [HttpGet("overload")]
    public async Task<ActionResult<ApiResponseDto<object>>> Overload([FromQuery] int threshold = 10)
    {
        const string sql = @"
SELECT
    hd.HangDoi_Id                AS hangDoiId,
    hd.PhongBan_Id               AS phongBanId,
    COUNT(*)                     AS waiting
FROM dbo.HangDoiPhongBan hd WITH (NOLOCK)
WHERE hd.Huy = 0
  AND hd.NgayGioThucHien IS NULL
  AND hd.NgayGioHoanTat  IS NULL
  AND CONVERT(date, hd.NgayThucHien) = CONVERT(date, GETDATE())
GROUP BY hd.HangDoi_Id, hd.PhongBan_Id
HAVING COUNT(*) >= @t
ORDER BY waiting DESC;";
        var rows = (await _db.ListAsync(sql, new { t = threshold })).ToList();
        return Ok(new ApiResponseDto<object>(new
        {
            threshold,
            overloaded = rows,
        }));
    }

    [HttpGet("face-stats")]
    public async Task<ActionResult<ApiResponseDto<object>>> FaceStats([FromQuery] DateTime? date)
    {
        var d = (date ?? DateTime.Today).Date;
        const string sql = @"
DECLARE @dFrom datetime = @d, @dTo datetime = DATEADD(DAY, 1, @d);

SELECT
    (SELECT COUNT(*) FROM dbo.PatientFaceEmbedding WHERE RevokedAt IS NULL) AS enrolledActive,
    (SELECT COUNT(*) FROM dbo.FaceAuditLog
        WHERE CreatedAt >= @dFrom AND CreatedAt < @dTo
          AND Action = 'IDENTIFY' AND Result = 'SUCCESS')                   AS identifySuccess,
    (SELECT COUNT(*) FROM dbo.FaceAuditLog
        WHERE CreatedAt >= @dFrom AND CreatedAt < @dTo
          AND Action = 'IDENTIFY' AND Result = 'FAIL')                      AS identifyFail,
    (SELECT AVG(Confidence) FROM dbo.FaceAuditLog
        WHERE CreatedAt >= @dFrom AND CreatedAt < @dTo
          AND Action = 'IDENTIFY' AND Result = 'SUCCESS')                   AS avgConfidence;";
        var row = await _db.OneAsync(sql, new { d });
        return Ok(new ApiResponseDto<object>(row ?? new { }));
    }

    // ════════════════════════════════════════════════════════════
    // Báo cáo HIS-light
    // ════════════════════════════════════════════════════════════

    /// <summary>GET /dashboard/revenue?days=N — doanh thu theo ngày trong N ngày qua.</summary>
    [HttpGet("revenue")]
    public async Task<ActionResult<ApiResponseDto<object>>> Revenue([FromQuery] int days = 7)
    {
        days = Math.Clamp(days, 1, 90);
        const string sql = @"
DECLARE @from date = DATEADD(DAY, -(@n - 1), CONVERT(date, GETDATE()));
WITH d AS (
    SELECT TOP (@n)
        Ngay = DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @from)
    FROM sys.all_objects
)
SELECT
    Ngay = d.Ngay,
    SoHoaDon = ISNULL(s.SoHoaDon, 0),
    DaThu = ISNULL(s.DaThu, 0),
    ChuaThu = ISNULL(s.ChuaThu, 0)
FROM d
LEFT JOIN (
    SELECT CONVERT(date, NgayLap) AS Ngay,
           COUNT(*) AS SoHoaDon,
           SUM(CASE WHEN TrangThai = N'DaThu' THEN BenhNhan_PhaiThu ELSE 0 END) AS DaThu,
           SUM(CASE WHEN TrangThai = N'ChuaThu' THEN BenhNhan_PhaiThu ELSE 0 END) AS ChuaThu
    FROM dbo.KB_HoaDon WITH (NOLOCK)
    WHERE NgayLap >= @from
    GROUP BY CONVERT(date, NgayLap)
) s ON s.Ngay = d.Ngay
ORDER BY d.Ngay;";
        var rows = (await _db.ListAsync(sql, new { n = days })).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /dashboard/top-services?days=N&top=10 — top dịch vụ theo tần suất chỉ định.</summary>
    [HttpGet("top-services")]
    public async Task<ActionResult<ApiResponseDto<object>>> TopServices(
        [FromQuery] int days = 7,
        [FromQuery] int top = 10)
    {
        days = Math.Clamp(days, 1, 90);
        top = Math.Clamp(top, 1, 50);
        string sql = $@"
DECLARE @from date = DATEADD(DAY, -({days} - 1), CONVERT(date, GETDATE()));
SELECT TOP ({top})
    dv.DICHVU_ID, dv.TENDICHVU, dv.LoaiDV, dv.DonGia,
    SoLuotChiDinh = COUNT(*),
    DoanhThu = SUM(ISNULL(dv.DonGia, 0))
FROM dbo.DichVuYeuCau yc WITH (NOLOCK)
JOIN dbo.DM_DichVu dv WITH (NOLOCK) ON yc.DICHVU_ID = dv.DICHVU_ID
WHERE yc.NGAYYEUCAU >= @from AND yc.HUYYEUCAU = 0
GROUP BY dv.DICHVU_ID, dv.TENDICHVU, dv.LoaiDV, dv.DonGia
ORDER BY SoLuotChiDinh DESC, DoanhThu DESC;";
        var rows = (await _db.ListAsync(sql)).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /dashboard/top-doctors?days=N&top=10 — top bác sĩ khám nhiều nhất.</summary>
    [HttpGet("top-doctors")]
    public async Task<ActionResult<ApiResponseDto<object>>> TopDoctors(
        [FromQuery] int days = 7,
        [FromQuery] int top = 10)
    {
        days = Math.Clamp(days, 1, 90);
        top = Math.Clamp(top, 1, 50);
        string sql = $@"
DECLARE @from date = DATEADD(DAY, -({days} - 1), CONVERT(date, GETDATE()));
SELECT TOP ({top})
    BacSi = ISNULL(ba.TenBacSi, N'(Không có tên)'),
    SoLuotKham = COUNT(*),
    SoChiDinhCLS = ISNULL(SUM(
        (SELECT COUNT(*) FROM dbo.DichVuYeuCau yc WITH (NOLOCK)
           WHERE yc.TIEPNHAN_ID = ba.TiepNhan_Id AND yc.HUYYEUCAU = 0)), 0),
    SoDonThuoc = ISNULL(SUM(
        (SELECT COUNT(*) FROM dbo.KB_DonThuoc dt WITH (NOLOCK)
           WHERE dt.BenhAn_Id = ba.BenhAn_Id)), 0)
FROM dbo.KB_BenhAn ba WITH (NOLOCK)
WHERE CONVERT(date, ba.NgayKham) >= @from
GROUP BY ba.TenBacSi
ORDER BY SoLuotKham DESC;";
        var rows = (await _db.ListAsync(sql)).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /dashboard/revenue-by-loai?days=N — doanh thu theo loại (khám/CLS/CDHA/thuốc).</summary>
    [HttpGet("revenue-by-loai")]
    public async Task<ActionResult<ApiResponseDto<object>>> RevenueByLoai([FromQuery] int days = 7)
    {
        days = Math.Clamp(days, 1, 90);
        const string sql = @"
DECLARE @from date = DATEADD(DAY, -(@n - 1), CONVERT(date, GETDATE()));
SELECT Loai = ct.Loai,
       SoMuc = COUNT(*),
       DoanhThu = SUM(ct.ThanhTien)
FROM dbo.KB_HoaDon_ChiTiet ct WITH (NOLOCK)
JOIN dbo.KB_HoaDon hd WITH (NOLOCK) ON ct.HoaDon_Id = hd.HoaDon_Id
WHERE hd.TrangThai = N'DaThu' AND CONVERT(date, hd.NgayThu) >= @from
GROUP BY ct.Loai
ORDER BY DoanhThu DESC;";
        var rows = (await _db.ListAsync(sql, new { n = days })).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    // ════════════════════════════════════════════════════════════
    // Phân tích vận hành theo khoảng ngày (Dashboard ▸ KPI vận hành,
    // phần mở rộng "Phân tích vận hành").
    //
    // Khác /summary|/throughput (chỉ 1 ngày, realtime auto-refresh) —
    // nhóm này nhận from/to để phân tích xu hướng LỊCH SỬ:
    //   /analytics/throughput-daily   thông lượng + chờ TB theo từng ngày
    //   /analytics/heatmap            giờ × thứ trong tuần (giờ cao điểm)
    //   /analytics/queue-performance  hiệu suất từng hàng đợi/phòng
    //   /analytics/wait-distribution  phân bố thời gian chờ + % quá ngưỡng
    //
    // Quy ước thời gian (NgayGioLaySo/ThucHien/HoanTat đều là datetime):
    //   - "chờ"     = LaySo → ThucHien  (chờ trước khi được gọi/phục vụ)
    //   - "phục vụ" = ThucHien → HoanTat
    // Cắt biên 0..36000s (≤ 10h) để loại outlier/giá trị âm rác.
    // ════════════════════════════════════════════════════════════

    /// <summary>Chuẩn hoá khoảng ngày: mặc định 7 ngày tới hôm nay, đảo nếu from>to, trần 92 ngày.</summary>
    private static (DateTime from, DateTime to, int n) ResolveRange(DateTime? from, DateTime? to)
    {
        var dTo = (to ?? DateTime.Today).Date;
        var dFrom = (from ?? dTo.AddDays(-6)).Date;
        if (dFrom > dTo) (dFrom, dTo) = (dTo, dFrom);
        var n = (dTo - dFrom).Days + 1;
        if (n > 92) { dFrom = dTo.AddDays(-91); n = 92; }
        return (dFrom, dTo, n);
    }

    /// <summary>GET /dashboard/analytics/throughput-daily?from=&amp;to= — phát số/hoàn tất + chờ TB từng ngày (có date-spine để ngày trống = 0).</summary>
    [HttpGet("analytics/throughput-daily")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThroughputDaily(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var (dFrom, dTo, n) = ResolveRange(from, to);
        const string sql = @"
DECLARE @dTo2 datetime = DATEADD(DAY, 1, @dToDate);
WITH spine AS (
    SELECT TOP (@n)
        Ngay = CONVERT(date, DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @dFromDate))
    FROM sys.all_objects
), agg AS (
    SELECT CONVERT(date, NgayGioLaySo) AS Ngay,
           COUNT(*) AS issued,
           SUM(CASE WHEN NgayGioHoanTat IS NOT NULL THEN 1 ELSE 0 END) AS completed,
           AVG(CASE WHEN NgayGioThucHien IS NOT NULL
                     AND DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) BETWEEN 0 AND 36000
                    THEN DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) END) AS avgWaitSec
    FROM dbo.HangDoiPhongBan WITH (NOLOCK)
    WHERE Huy = 0 AND NgayGioLaySo >= @dFromDate AND NgayGioLaySo < @dTo2
    GROUP BY CONVERT(date, NgayGioLaySo)
)
SELECT ngay           = s.Ngay,
       issued         = ISNULL(a.issued, 0),
       completed      = ISNULL(a.completed, 0),
       avgWaitMinutes = ROUND(ISNULL(a.avgWaitSec, 0) / 60.0, 1)
FROM spine s
LEFT JOIN agg a ON a.Ngay = s.Ngay
ORDER BY s.Ngay;";
        var rows = (await _db.ListAsync(sql, new { dFromDate = dFrom, dToDate = dTo, n })).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /dashboard/analytics/heatmap?from=&amp;to= — số BN theo (thứ 0=T2..6=CN) × giờ. dow tính từ mốc 1900-01-01 (thứ Hai) nên độc lập SET DATEFIRST.</summary>
    [HttpGet("analytics/heatmap")]
    public async Task<ActionResult<ApiResponseDto<object>>> Heatmap(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var (dFrom, dTo, _) = ResolveRange(from, to);
        const string sql = @"
DECLARE @dTo2 datetime = DATEADD(DAY, 1, @dToDate);
SELECT dow  = (DATEDIFF(DAY, '19000101', CONVERT(date, NgayGioLaySo)) % 7),
       gio  = DATEPART(HOUR, NgayGioLaySo),
       soBN = COUNT(*)
FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE Huy = 0 AND NgayGioLaySo >= @dFromDate AND NgayGioLaySo < @dTo2
GROUP BY (DATEDIFF(DAY, '19000101', CONVERT(date, NgayGioLaySo)) % 7), DATEPART(HOUR, NgayGioLaySo)
ORDER BY dow, gio;";
        var rows = (await _db.ListAsync(sql, new { dFromDate = dFrom, dToDate = dTo })).ToList();
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /dashboard/analytics/queue-performance?from=&amp;to= — xếp hạng từng HangDoi/PhongBan: lượt, chờ TB, phục vụ TB, tỷ lệ hoàn tất/huỷ.</summary>
    [HttpGet("analytics/queue-performance")]
    public async Task<ActionResult<ApiResponseDto<object>>> QueuePerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var (dFrom, dTo, _) = ResolveRange(from, to);
        const string sql = @"
DECLARE @dTo2 datetime = DATEADD(DAY, 1, @dToDate);
SELECT
    hangDoiId   = hd.HangDoi_Id,
    phongBanId  = hd.PhongBan_Id,
    tenHangDoi  = dh.TenHangDoi,
    tenPhongBan = ISNULL(NULLIF(pb.TenPhongBan, N''), pb.TenPhongBanDayDu),
    total       = COUNT(*),
    issued      = SUM(CASE WHEN hd.Huy = 0 THEN 1 ELSE 0 END),
    completed   = SUM(CASE WHEN hd.Huy = 0 AND hd.NgayGioHoanTat IS NOT NULL THEN 1 ELSE 0 END),
    cancelled   = SUM(CASE WHEN hd.Huy = 1 THEN 1 ELSE 0 END),
    avgWaitSec  = AVG(CASE WHEN hd.Huy = 0 AND hd.NgayGioThucHien IS NOT NULL
                            AND DATEDIFF(SECOND, hd.NgayGioLaySo, hd.NgayGioThucHien) BETWEEN 0 AND 36000
                           THEN DATEDIFF(SECOND, hd.NgayGioLaySo, hd.NgayGioThucHien) END),
    avgServeSec = AVG(CASE WHEN hd.Huy = 0 AND hd.NgayGioThucHien IS NOT NULL AND hd.NgayGioHoanTat IS NOT NULL
                            AND DATEDIFF(SECOND, hd.NgayGioThucHien, hd.NgayGioHoanTat) BETWEEN 0 AND 36000
                           THEN DATEDIFF(SECOND, hd.NgayGioThucHien, hd.NgayGioHoanTat) END)
FROM dbo.HangDoiPhongBan hd WITH (NOLOCK)
LEFT JOIN dbo.DM_HangDoi  dh WITH (NOLOCK) ON dh.HangDoi_Id  = hd.HangDoi_Id
LEFT JOIN dbo.DM_PhongBan pb WITH (NOLOCK) ON pb.PhongBan_Id = hd.PhongBan_Id
WHERE hd.NgayGioLaySo >= @dFromDate AND hd.NgayGioLaySo < @dTo2
GROUP BY hd.HangDoi_Id, hd.PhongBan_Id, dh.TenHangDoi, pb.TenPhongBan, pb.TenPhongBanDayDu
ORDER BY issued DESC;";
        var rows = (await _db.ListAsync(sql, new { dFromDate = dFrom, dToDate = dTo })).ToList();
        var shaped = rows.Select(r =>
        {
            var d = (IDictionary<string, object>)r;
            int GetI(string k) => d.TryGetValue(k, out var v) && v is not null ? Convert.ToInt32(v) : 0;
            double GetD(string k) => d.TryGetValue(k, out var v) && v is not null ? Convert.ToDouble(v) : 0d;
            object Get(string k) => d.TryGetValue(k, out var v) ? v : null;
            int issued = GetI("issued"), total = GetI("total"),
                completed = GetI("completed"), cancelled = GetI("cancelled");
            return new
            {
                hangDoiId = Get("hangDoiId"),
                phongBanId = Get("phongBanId"),
                tenHangDoi = Get("tenHangDoi"),
                tenPhongBan = Get("tenPhongBan"),
                total,
                issued,
                completed,
                cancelled,
                avgWaitMinutes = Math.Round(GetD("avgWaitSec") / 60d, 1),
                avgServeMinutes = Math.Round(GetD("avgServeSec") / 60d, 1),
                completionRate = issued > 0 ? Math.Round(100.0 * completed / issued, 1) : 0d,
                cancelRate = total > 0 ? Math.Round(100.0 * cancelled / total, 1) : 0d,
            };
        });
        return Ok(new ApiResponseDto<object>(shaped));
    }

    /// <summary>GET /dashboard/analytics/wait-distribution?from=&amp;to=&amp;threshold=15 — histogram thời gian chờ (bucketOrder 1..6) + % vượt ngưỡng.</summary>
    [HttpGet("analytics/wait-distribution")]
    public async Task<ActionResult<ApiResponseDto<object>>> WaitDistribution(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int threshold = 15)
    {
        var (dFrom, dTo, _) = ResolveRange(from, to);
        threshold = Math.Clamp(threshold, 1, 120);

        // bucketOrder: 1:<5  2:5-10  3:10-15  4:15-20  5:20-30  6:≥30
        // Nhãn hiển thị do FE map (giữ Unicode khỏi SQL).
        const string bucketsSql = @"
DECLARE @dTo2 datetime = DATEADD(DAY, 1, @dToDate);
SELECT bucketOrder, soBN = COUNT(*)
FROM (
    SELECT bucketOrder = CASE
             WHEN waitMin < 5  THEN 1 WHEN waitMin < 10 THEN 2 WHEN waitMin < 15 THEN 3
             WHEN waitMin < 20 THEN 4 WHEN waitMin < 30 THEN 5 ELSE 6 END
    FROM (
        SELECT waitMin = DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) / 60.0
        FROM dbo.HangDoiPhongBan WITH (NOLOCK)
        WHERE Huy = 0 AND NgayGioThucHien IS NOT NULL
          AND NgayGioLaySo >= @dFromDate AND NgayGioLaySo < @dTo2
          AND DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) BETWEEN 0 AND 36000
    ) w
) t
GROUP BY bucketOrder
ORDER BY bucketOrder;";
        var buckets = (await _db.ListAsync(bucketsSql, new { dFromDate = dFrom, dToDate = dTo })).ToList();

        const string summarySql = @"
DECLARE @dTo2 datetime = DATEADD(DAY, 1, @dToDate);
SELECT
    total         = COUNT(*),
    overThreshold = SUM(CASE WHEN DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) > @thr * 60 THEN 1 ELSE 0 END),
    avgWaitSec    = AVG(CAST(DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) AS FLOAT))
FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE Huy = 0 AND NgayGioThucHien IS NOT NULL
  AND NgayGioLaySo >= @dFromDate AND NgayGioLaySo < @dTo2
  AND DATEDIFF(SECOND, NgayGioLaySo, NgayGioThucHien) BETWEEN 0 AND 36000;";
        var s = await _db.OneAsync(summarySql, new { dFromDate = dFrom, dToDate = dTo, thr = threshold });
        var sd = s as IDictionary<string, object>;
        int SiI(string k) => sd is not null && sd.TryGetValue(k, out var v) && v is not null ? Convert.ToInt32(v) : 0;
        double SiD(string k) => sd is not null && sd.TryGetValue(k, out var v) && v is not null ? Convert.ToDouble(v) : 0d;
        int total = SiI("total"), over = SiI("overThreshold");

        return Ok(new ApiResponseDto<object>(new
        {
            threshold,
            buckets,
            total,
            overThreshold = over,
            overThresholdPct = total > 0 ? Math.Round(100.0 * over / total, 1) : 0d,
            avgWaitMinutes = Math.Round(SiD("avgWaitSec") / 60d, 1),
        }));
    }
}
