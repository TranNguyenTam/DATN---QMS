using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Qms.API.Services;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using System.Security.Claims;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/face")]
[Authorize]
public class FaceEnrollmentController : ControllerBase
{
    private readonly IFaceEnrollmentService _enroll;
    private readonly IFaceAuditService _audit;
    private readonly IFaceAiClient _ai;
    private readonly IDatabaseHelper _db;

    public FaceEnrollmentController(
        IFaceEnrollmentService enroll,
        IFaceAuditService audit,
        IFaceAiClient ai,
        IDatabaseHelper db)
    {
        _enroll = enroll;
        _audit = audit;
        _ai = ai;
        _db = db;
    }

    private int? GetUserId()
    {
        foreach (var claim in new[] { "userId", "UserId", "user_id", ClaimTypes.NameIdentifier })
        {
            var v = User.FindFirstValue(claim);
            if (int.TryParse(v, out var id) && id > 0) return id;
        }
        return null;
    }

    private string? ClientIp => HttpContext.Connection.RemoteIpAddress?.ToString();
    private string? UserAgent => Request.Headers.UserAgent.ToString();

    // ─── Camera Hikvision proxy ─────────────────────────────────────────────
    // FE Kiosk gọi /face/camera/status để biết có Hikvision không. Nếu có thì
    // dùng /face/camera/snapshot lấy ảnh, nếu không thì fallback webcam USB
    // (navigator.mediaDevices.getUserMedia).

    [HttpGet("camera/status")]
    public async Task<ActionResult<ApiResponseDto<object>>> CameraStatus(CancellationToken ct)
    {
        var status = await _ai.GetCameraStatusAsync(ct);
        return Ok(new ApiResponseDto<object>(new
        {
            hikAvailable = status.HikAvailable,
            reason = status.Reason,
            ip = status.Ip,
            stream = status.Stream,
        }));
    }

    [HttpGet("camera/snapshot")]
    public async Task<IActionResult> CameraSnapshot(CancellationToken ct)
    {
        var bytes = await _ai.GetCameraSnapshotAsync(ct);
        if (bytes == null || bytes.Length == 0)
            return StatusCode(503, new ApiResponseDto<object>(new { error = "Hikvision không sẵn sàng" }));
        Response.Headers.CacheControl = "no-store";
        return File(bytes, "image/jpeg");
    }

    // Không dùng [FromForm] struct vì cần multipart; dùng IFormFile + query/form.
    [HttpPost("enroll")]
    [EnableRateLimiting("face")]
    [RequestSizeLimit(10_000_000)] // 10 MB
    public async Task<ActionResult<ApiResponseDto<object>>> Enroll(
        [FromForm] string maYTe,
        [FromForm] string? hoTen,
        [FromForm] IFormFile image,
        CancellationToken ct)
    {
        if (image is null || image.Length == 0)
        {
            return BadRequest(new ApiResponseDto<object>(new
            {
                ok = false,
                message = "Thiếu ảnh"
            }));
        }

        using var ms = new MemoryStream();
        await image.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();

        var result = await _enroll.EnrollAsync(
            maYTe, hoTen, bytes, image.FileName,
            GetUserId(), ClientIp, UserAgent, ct);

        return Ok(new ApiResponseDto<object>(new
        {
            ok = result.Ok,
            message = result.Message,
            id = result.Id,
        }));
    }

    [HttpPost("revoke")]
    public async Task<ActionResult<ApiResponseDto<object>>> Revoke([FromBody] RevokeRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.MaYTe))
        {
            return BadRequest(new ApiResponseDto<object>(new { ok = false, message = "Thiếu mã y tế" }));
        }
        var ok = await _enroll.RevokeAsync(req.MaYTe, GetUserId(), ClientIp, ct);
        return Ok(new ApiResponseDto<object>(new
        {
            ok,
            message = ok ? "Đã thu hồi đăng ký khuôn mặt" : "Không tìm thấy bản ghi để thu hồi",
        }));
    }

    [HttpGet("enrolled")]
    public async Task<ActionResult<ApiResponseDto<object>>> Enrolled(CancellationToken ct)
    {
        var list = await _enroll.ListActiveAsync(ct);
        await _audit.WriteAsync(FaceAuditAction.View, FaceAuditResult.Success,
            userId: GetUserId(), message: $"count={list.Count}", clientIp: ClientIp, ct: ct);
        // Chiếu sang khóa camelCase cho khớp dataIndex của bảng FE (FaceEnrollment.jsx).
        var payload = list.Select(r => new
        {
            maYTe = r.MaYTe,
            hoTen = r.HoTen,
            enrolledAt = r.EnrolledAt,
            activeImages = r.ActiveImages,
        });
        return Ok(new ApiResponseDto<object>(payload));
    }

    /// <summary>
    /// GET /api/v1/face/patients?keyword=&status=all|enrolled|unenrolled
    /// Danh sách BN kèm SỐ ẢNH khuôn mặt đã đăng ký — để TÌM KIẾM bệnh nhân và
    /// biết ai CHƯA đăng ký. keyword khớp tên / mã y tế / CCCD / SĐT.
    /// </summary>
    [HttpGet("patients")]
    public async Task<ActionResult<ApiResponseDto<object>>> Patients(
        [FromQuery] string? keyword = null,
        [FromQuery] string status = "all",
        [FromQuery] int limit = 100)
    {
        var kw = string.IsNullOrWhiteSpace(keyword) ? null : keyword.Trim();
        const string sql = @"
SELECT TOP (@Limit)
    maYTe       = bn.MAYTE,
    hoTen       = bn.TENBENHNHAN,
    gioiTinh    = bn.GIOITINH,
    namSinh     = bn.NAMSINH,
    soDienThoai = bn.SODIENTHOAI,
    soAnh       = ISNULL(e.SoAnh, 0)
FROM dbo.BenhNhan bn WITH (NOLOCK)
LEFT JOIN (
    SELECT MaYTe, COUNT(*) AS SoAnh
    FROM dbo.PatientFaceEmbedding WITH (NOLOCK)
    WHERE RevokedAt IS NULL
    GROUP BY MaYTe
) e ON e.MaYTe = bn.MAYTE
WHERE bn.ACTIVE = '1'
  AND (@Kw IS NULL
       OR bn.TENBENHNHAN LIKE N'%' + @Kw + N'%'
       OR bn.MAYTE       LIKE '%'  + @Kw + '%'
       OR bn.CMND        LIKE '%'  + @Kw + '%'
       OR bn.SODIENTHOAI LIKE '%'  + @Kw + '%')
  AND ( @Status = 'all'
        OR (@Status = 'enrolled'   AND ISNULL(e.SoAnh, 0) > 0)
        OR (@Status = 'unenrolled' AND ISNULL(e.SoAnh, 0) = 0) )
ORDER BY bn.BENHNHAN_ID DESC;";
        var rows = await _db.ListAsync(sql, new { Kw = kw, Status = status, Limit = limit });
        return Ok(new ApiResponseDto<object>(rows));
    }

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponseDto<object>>> Health(CancellationToken ct)
    {
        var (ok, message) = await _ai.CheckHealthAsync(ct);
        return Ok(new ApiResponseDto<object>(new { available = ok, message }));
    }

    /// <summary>
    /// Audit log truy cập dữ liệu sinh trắc — Nghị định 13/2023.
    /// Filter theo ngày + action + maYTe (tùy chọn).
    /// </summary>
    [HttpGet("audit-log")]
    public async Task<ActionResult<ApiResponseDto<object>>> AuditLog(
        [FromQuery] int days = 7,
        [FromQuery] string? action = null,
        [FromQuery] string? maYTe = null,
        [FromQuery] int limit = 200)
    {
        const string sql = @"
SELECT TOP (@Limit)
    Id, Action, MaYTe, UserId, Result, Confidence,
    Message, ClientIp, UserAgent, CreatedAt
FROM dbo.FaceAuditLog
WHERE CreatedAt >= DATEADD(DAY, -@Days, SYSDATETIME())
  AND (@Action IS NULL OR Action = @Action)
  AND (@MaYTe IS NULL OR MaYTe = @MaYTe)
ORDER BY Id DESC;";
        var rows = await _db.ListAsync(sql, new { Days = days, Action = action, MaYTe = maYTe, Limit = limit });
        // KHÔNG self-audit ở đây: xem nhật ký mà lại sinh thêm dòng VIEW → record
        // "tự nhảy" mỗi lần tải lại + làm nhiễu log. Việc xem danh sách enrolled
        // (data sinh trắc thật) vẫn được audit ở action /enrolled.
        return Ok(new ApiResponseDto<object>(rows));
    }

    public class RevokeRequest
    {
        public string MaYTe { get; set; } = string.Empty;
    }
}
