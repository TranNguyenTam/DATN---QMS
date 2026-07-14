using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Qms.API.Services;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/kiosk")]
[Authorize]
public class KioskController : ControllerBase
{
    private readonly IHangDoiPhongBanService _hangDoiSvc;
    private readonly IHangDoiTiepNhanService _hangDoiTiepNhanSvc;
    private readonly ITiepNhanTuDongService _tuDongSvc;
    private readonly ISocketService _socket;
    private readonly IWaitTimeEstimator _waitTimeEstimator;
    private readonly IFaceAiClient _faceAiClient;
    private readonly IFaceGalleryCache _faceGallery;
    private readonly IFaceAuditService _faceAudit;
    private readonly IDatabaseHelper _db;

    public KioskController(
        IHangDoiPhongBanService hangDoiSvc,
        IHangDoiTiepNhanService hangDoiTiepNhanSvc,
        ITiepNhanTuDongService tuDongSvc,
        ISocketService socket,
        IWaitTimeEstimator waitTimeEstimator,
        IFaceAiClient faceAiClient,
        IFaceGalleryCache faceGallery,
        IFaceAuditService faceAudit,
        IDatabaseHelper db)
    {
        _hangDoiSvc = hangDoiSvc;
        _hangDoiTiepNhanSvc = hangDoiTiepNhanSvc;
        _tuDongSvc = tuDongSvc;
        _socket = socket;
        _waitTimeEstimator = waitTimeEstimator;
        _faceAiClient = faceAiClient;
        _faceGallery = faceGallery;
        _faceAudit = faceAudit;
        _db = db;
    }

    private int GetUserId()
    {
        var candidates = new[]
        {
            User.FindFirstValue("userId"),
            User.FindFirstValue("UserId"),
            User.FindFirstValue("user_id"),
            User.FindFirstValue(ClaimTypes.NameIdentifier),
        };

        foreach (var value in candidates)
        {
            if (int.TryParse(value, out var id) && id > 0)
                return id;
        }

        return 0;
    }

    // GET /api/v1/kiosk/queue-list
    [HttpGet("queue-list")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetQueueList()
    {
        int userId = GetUserId();
        return Ok(new ApiResponseDto<object>(await _hangDoiSvc.GetQueueListAsync(userId)));
    }

    // GET /api/v1/kiosk/loai-uu-tien
    [HttpGet("loai-uu-tien")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetLoaiUuTien()
        => Ok(new ApiResponseDto<object>(await _hangDoiSvc.GetLoaiUuTienAsync()));

    // GET /api/v1/kiosk/loai-dich-vu
    [HttpGet("loai-dich-vu")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetLoaiDichVu()
        => Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanSvc.SelectDichVuKhamBenhAsync()));

    // GET /api/v1/kiosk/check-ma?maYTe=
    [HttpGet("check-ma")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckMa([FromQuery] string maYTe)
        => Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanSvc.CheckSoVaoVienVPAsync(maYTe.Trim())));

    // POST /api/v1/kiosk/tu-dong-tiep-nhan
    [HttpPost("tu-dong-tiep-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> TuDongTiepNhan([FromBody] TuDongTiepNhanReq req)
    {
        int userId = GetUserId();
        var res = System.Linq.Enumerable.ToList(await _tuDongSvc.ProcessTuDongTiepNhanAsync(userId, req));
        // Gắn BN vào lượt "lấy số nhanh" đang tiếp nhận → tên BN thay "---" trên hàng
        // đợi tiếp nhận + QR (?id=) tự theo hành trình sang Khám.
        if (res.Count > 0 && req.TiepNhanHangDoiPhongBanId > 0 && req.BenhNhanId > 0)
        {
            await _hangDoiSvc.LinkBenhNhanAsync(req.TiepNhanHangDoiPhongBanId, req.BenhNhanId);
            // Báo cho màn hàng đợi TIẾP NHẬN refresh để tên BN vừa gắn hiện lên NGAY
            // (broadcast bên dưới chỉ báo HĐ3 Khám). Lấy đúng HangDoi_Id của lượt số đó.
            var recvHd = await _db.ScalarAsync<int?>(
                "SELECT HangDoi_Id FROM dbo.HangDoiPhongBan WHERE HangDoiPhongBan_Id = @Id",
                new { Id = req.TiepNhanHangDoiPhongBanId });
            if (recvHd.HasValue)
                await _socket.SendAsync("NHAN_BN", recvHd.Value, null);
        }
        if (res.Count > 0)
            await _socket.SendAsync("NHAN_BN", 3, null);
        return Ok(new ApiResponseDto<object>(res));
    }

    // POST /api/v1/kiosk/queue-checkin
    [HttpPost("queue-checkin")]
    public async Task<ActionResult<ApiResponseDto<object>>> QueueCheckIn([FromBody] ThemBnCheckInRequest req)
    {
        var res = System.Linq.Enumerable.ToList(await _hangDoiSvc.ThemBnCheckInAsync(req));
        if (res.Count > 0)
            await _socket.SendAsync("NHAN_BN", req.HangDoiId, null);
        return Ok(new ApiResponseDto<object>(res));
    }

    // GET /api/v1/kiosk/queue-display?phongBanId=
    [HttpGet("queue-display")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetQueueDisplay([FromQuery] int phongBanId)
        => Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanSvc.GetHangDoiHienThiTVTiepNhanAsync(phongBanId)));

    // GET /api/v1/kiosk/waiting?hangDoiId=
    [HttpGet("waiting")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetWaiting([FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanSvc.GetHangDoiTiepNhanDangChoAsync(hangDoiId)));

    // GET /api/v1/kiosk/wait-estimate?hangDoiId=&priorityWeight=
    [HttpGet("wait-estimate")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetWaitEstimate([FromQuery] int hangDoiId, [FromQuery] int priorityWeight = 1)
    {
        var estimate = await _waitTimeEstimator.EstimateAsync(hangDoiId, priorityWeight);
        return Ok(new ApiResponseDto<object>(estimate));
    }

    // GET /api/v1/kiosk/face-ai-health
    [HttpGet("face-ai-health")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetFaceAiHealth()
    {
        var health = await _faceAiClient.CheckHealthAsync();
        return Ok(new ApiResponseDto<object>(new
        {
            available = health.ok,
            message = health.message
        }));
    }

    // POST /api/v1/kiosk/face-checkin  (multipart: image + form fields)
    [HttpPost("face-checkin")]
    [EnableRateLimiting("face")]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<ApiResponseDto<object>>> FaceCheckIn(
        [FromForm] int hangDoiId,
        [FromForm] int uuTien,
        [FromForm] string? loaiUuTien,
        [FromForm] int priorityWeight,
        [FromForm] string? manualPatientCode,
        [FromForm] int? dichVuId,
        [FromForm] IFormFile? image,
        CancellationToken ct)
    {
        var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers.UserAgent.ToString();

        string? effectivePersonId = null;
        double effectiveConfidence = 0d;
        bool fallbackUsed = false;
        string? aiError = null;

        if (image is { Length: > 0 })
        {
            // Toàn bộ bước nhận diện bọc trong try/catch: DB/AI lỗi KHÔNG được chặn
            // nhánh nhập tay (manualPatientCode) phía dưới — một blip DB không làm
            // kẹt cả hàng người ở kiosk.
            try
            {
                using var ms = new MemoryStream();
                await image.CopyToAsync(ms, ct);
                var bytes = ms.ToArray();

                // 1) Python CHỈ trích embedding của ảnh probe (không nhận cả gallery).
                var embed = await _faceAiClient.EmbedAsync(bytes, image.FileName, ct);
                if (!embed.Ok || embed.Embedding is null)
                {
                    // Không thấy mặt / nhiều mặt / nghi giả mạo → nghiệp vụ bình thường.
                    aiError = embed.Error ?? "Không phát hiện khuôn mặt trong ảnh";
                    await _faceAudit.WriteAsync(FaceAuditAction.Identify, FaceAuditResult.Fail,
                        message: aiError, clientIp: clientIp, userAgent: ua, ct: ct);
                }
                else
                {
                    // 2) So khớp 1:N NGAY TẠI backend (gallery cache RAM + margin gate),
                    //    không ship template sinh trắc ra ngoài tiến trình.
                    var match = await _faceGallery.MatchAsync(embed.Embedding, ct);
                    effectiveConfidence = match.BestScore;
                    if (match.Recognized && !string.IsNullOrWhiteSpace(match.PatientCode))
                    {
                        effectivePersonId = match.PatientCode;
                        await _faceAudit.WriteAsync(FaceAuditAction.Identify, FaceAuditResult.Success,
                            maYTe: effectivePersonId, confidence: effectiveConfidence,
                            clientIp: clientIp, userAgent: ua, ct: ct);
                    }
                    else
                    {
                        aiError = match.GallerySize == 0
                            ? "Chưa có bệnh nhân nào đăng ký khuôn mặt"
                            : $"Không khớp (cosine {match.BestScore:F3} < {match.Threshold:F2} hoặc cách biệt < {match.Margin:F2})";
                        await _faceAudit.WriteAsync(FaceAuditAction.Identify, FaceAuditResult.Fail,
                            confidence: effectiveConfidence, message: aiError,
                            clientIp: clientIp, userAgent: ua, ct: ct);
                    }
                }
            }
            catch (Exception ex)
            {
                aiError = "Lỗi hệ thống nhận diện khuôn mặt";
                await _faceAudit.WriteAsync(FaceAuditAction.Identify, FaceAuditResult.Fail,
                    message: ex.Message, clientIp: clientIp, userAgent: ua, ct: ct);
            }
        }

        if (string.IsNullOrWhiteSpace(effectivePersonId) && !string.IsNullOrWhiteSpace(manualPatientCode))
        {
            effectivePersonId = manualPatientCode.Trim();
            fallbackUsed = true;
            // Audit RIÊNG cho check-in thủ công (bỏ qua sinh trắc) — truy vết theo NĐ13.
            await _faceAudit.WriteAsync(FaceAuditAction.Manual, FaceAuditResult.Success,
                maYTe: effectivePersonId, userId: GetUserId(),
                message: "Check-in nhập tay (không qua nhận diện khuôn mặt)",
                clientIp: clientIp, userAgent: ua, ct: ct);
        }

        if (string.IsNullOrWhiteSpace(effectivePersonId))
        {
            return Ok(new ApiResponseDto<object>(new
            {
                success = false,
                message = "Không nhận diện được khuôn mặt, vui lòng nhập mã y tế hoặc CCCD.",
                error = aiError,
                fallbackAvailable = true,
            }));
        }

        var checkRows = System.Linq.Enumerable.ToList(
            await _hangDoiTiepNhanSvc.CheckSoVaoVienVPAsync(effectivePersonId));
        if (checkRows.Count == 0)
        {
            return Ok(new ApiResponseDto<object>(new
            {
                success = false,
                message = "Không tìm thấy hồ sơ bệnh nhân trong QMS.",
                personId = effectivePersonId,
                confidence = effectiveConfidence,
                fallbackUsed,
                fallbackAvailable = true,
            }));
        }

        // Lấy BenhNhan_Id nội bộ để TIẾP NHẬN ĐẦY ĐỦ (không thêm số ẩn vào hàng đợi).
        var bnRow = (System.Collections.Generic.IDictionary<string, object>)checkRows[0];
        int benhNhanId = 0;
        foreach (var k in new[] { "BenhNhan_Id", "BENHNHAN_ID", "BenhNhanId" })
            if (bnRow.TryGetValue(k, out var bv) && bv != null
                && int.TryParse(bv.ToString(), out var bid)) { benhNhanId = bid; break; }
        if (benhNhanId <= 0)
        {
            return Ok(new ApiResponseDto<object>(new
            {
                success = false,
                message = "Không xác định được mã bệnh nhân nội bộ.",
                personId = effectivePersonId,
                fallbackAvailable = true,
            }));
        }

        // DEDUP: BN đã có lượt KHÁM (HĐ3) hôm nay
        // (tránh cùng 1 người bấm check-in nhiều lần → nhảy nhiều số).
        var existingRecord = await _db.OneAsync<dynamic>(@"
SELECT TOP 1 HangDoiPhongBan_Id, TinhTrang FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE BenhNhan_Id = @Bn AND HangDoi_Id = 3
  AND NgayThucHien = CONVERT(date, GETDATE()) AND (Huy = 0 OR Huy IS NULL)
ORDER BY HangDoiPhongBan_Id DESC;", new { Bn = benhNhanId });

        bool daTiepNhanTruoc = false;
        int existedId = 0;
        if (existingRecord != null)
        {
            var dict = (System.Collections.Generic.IDictionary<string, object>)existingRecord;
            int tinhTrang = dict.TryGetValue("TinhTrang", out var t) && t != null ? Convert.ToInt32(t) : 0;
            
            if (tinhTrang == 1 || tinhTrang == 2)
            {
                return Ok(new ApiResponseDto<object>(new
                {
                    success = false,
                    message = tinhTrang == 1 
                        ? "Bạn đang được gọi khám. Vui lòng di chuyển đến phòng khám." 
                        : "Bạn đã hoàn tất khám hôm nay. Không thể lấy thêm số.",
                    personId = effectivePersonId,
                    fallbackAvailable = true,
                }));
            }
            
            existedId = dict.TryGetValue("HangDoiPhongBan_Id", out var hId) && hId != null ? Convert.ToInt32(hId) : 0;
            if (existedId > 0)
            {
                daTiepNhanTruoc = true;
            }
        }

        System.Collections.Generic.List<dynamic> sttRows = new System.Collections.Generic.List<dynamic>();
        if (daTiepNhanTruoc)
        {
            sttRows = System.Linq.Enumerable.ToList(await _tuDongSvc.GetSoThuTuAsync(existedId));
        }
        else
        {
            // TIẾP NHẬN ĐẦY ĐỦ → đẩy thẳng HĐ3 (Khu Khám Bệnh) + gắn BN (có QR theo dõi).
            var tnReq = new TuDongTiepNhanReq
            {
                BenhNhanId = benhNhanId,
                UuTien = uuTien,
                DichVuId = dichVuId,
                ThuTienSau = 1,
                LoaiUuTienText = loaiUuTien,
            };
            sttRows = System.Linq.Enumerable.ToList(
                await _tuDongSvc.ProcessTuDongTiepNhanAsync(GetUserId(), tnReq));
            if (sttRows.Count > 0)
                await _socket.SendAsync("NHAN_BN", 3, null);
        }

        if (sttRows.Count == 0)
        {
            return Ok(new ApiResponseDto<object>(new
            {
                success = false,
                message = "Tiếp nhận tự động thất bại, vui lòng thử lại.",
                personId = effectivePersonId,
                fallbackAvailable = true,
            }));
        }

        var estimate = await _waitTimeEstimator.EstimateAsync(3, priorityWeight <= 0 ? 1 : priorityWeight);

        return Ok(new ApiResponseDto<object>(new
        {
            success = true,
            personId = effectivePersonId,
            confidence = effectiveConfidence,
            fallbackUsed,
            daTiepNhanTruoc,
            queue = sttRows,
            waitEstimate = estimate,
            fallbackAvailable = true,
        }));
    }
}
