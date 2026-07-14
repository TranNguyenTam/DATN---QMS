using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;

namespace Qms.API.Controllers;

/// <summary>
/// Endpoint public (không cần JWT) phục vụ PWA mobile của BN.
/// BN scan QR code → mở /track/:hangDoiId/:stt trên điện thoại → FE gọi
/// /api/v1/public/track để xem realtime trạng thái STT của mình mà không
/// cần đăng nhập.
///
/// Bảo mật: chỉ trả thông tin tối thiểu (tên BN, STT, ETA) — không lộ
/// thông tin nhạy cảm khác.
/// </summary>
[ApiController]
[Route("api/v1/public")]
[AllowAnonymous]
public class PublicController : ControllerBase
{
    private readonly IWaitTimeEstimator _waitTimeEstimator;
    private readonly PushNotificationService _push;

    public PublicController(IWaitTimeEstimator waitTimeEstimator, PushNotificationService push)
    {
        _waitTimeEstimator = waitTimeEstimator;
        _push = push;
    }

    // GET /api/v1/public/track?bn=  (theo dõi cả hành trình — ưu tiên cao nhất)
    //   hoặc ?id= (1 bước theo HangDoiPhongBan_Id) hoặc ?hangDoiId=&stt= (tương thích ngược)
    [HttpGet("track")]
    public async Task<ActionResult<ApiResponseDto<object>>> Track(
        [FromQuery] int hangDoiId,
        [FromQuery] int stt,
        [FromQuery] int id = 0,
        [FromQuery] int bn = 0)
    {
        object result;
        if (bn > 0) result = await _waitTimeEstimator.EstimateJourneyByBenhNhanAsync(bn);
        else if (id > 0) result = await _waitTimeEstimator.EstimatePersonalByIdAsync(id);
        else result = await _waitTimeEstimator.EstimatePersonalAsync(hangDoiId, stt);
        return Ok(new ApiResponseDto<object>(result));
    }

    // GET /api/v1/public/track-manifest?bn=|id=  — manifest PWA ĐỘNG: start_url = URL theo dõi
    // hiện tại → khi "Thêm vào màn hình chính" (nhất là iOS Safari), icon mở ĐÚNG số đang theo dõi.
    [HttpGet("track-manifest")]
    public IActionResult TrackManifest(
        [FromQuery] int id = 0,
        [FromQuery] int bn = 0,
        [FromQuery] int hangDoiId = 0,
        [FromQuery] int stt = 0)
    {
        string start = bn > 0 ? $"/track?bn={bn}"
            : id > 0 ? $"/track?id={id}"
            : (hangDoiId > 0 && stt > 0) ? $"/track/{hangDoiId}/{stt}"
            : "/track";
        var manifest = new
        {
            name = "QMS — Theo dõi số thứ tự",
            short_name = "QMS Track",
            description = "Theo dõi số thứ tự khám bệnh, nhận thông báo khi sắp đến lượt.",
            lang = "vi",
            start_url = start,
            scope = "/track",
            display = "standalone",
            theme_color = "#1677ff",
            background_color = "#f0f5ff",
            icons = new[]
            {
                new { src = "/pwa-192.png", sizes = "192x192", type = "image/png", purpose = "any maskable" },
                new { src = "/pwa-512.png", sizes = "512x512", type = "image/png", purpose = "any maskable" },
            },
        };
        return new JsonResult(manifest) { ContentType = "application/manifest+json" };
    }

    // GET /api/v1/public/push/vapid-public-key — FE lấy public key để đăng ký push.
    [HttpGet("push/vapid-public-key")]
    public ActionResult<ApiResponseDto<object>> VapidPublicKey()
        => Ok(new ApiResponseDto<object>(new { publicKey = _push.PublicKey }));

    // POST /api/v1/public/push/subscribe — FE gửi push subscription (kèm id hoặc bn).
    [HttpPost("push/subscribe")]
    public async Task<ActionResult<ApiResponseDto<object>>> Subscribe([FromBody] PushSubscribeRequest req)
    {
        var sub = req?.Subscription;
        if (sub is null || string.IsNullOrWhiteSpace(sub.Endpoint) || sub.Keys is null)
            return BadRequest(new ApiResponseDto<object>(new { ok = false, message = "Thiếu thông tin subscription" }));
        if (req!.Id <= 0 && req.Bn <= 0)
            return BadRequest(new ApiResponseDto<object>(new { ok = false, message = "Thiếu id hoặc bn" }));
        await _push.SaveAsync(sub.Endpoint, sub.Keys.P256dh, sub.Keys.Auth, req.Id, req.Bn);
        return Ok(new ApiResponseDto<object>(new { ok = true }));
    }
}

public class PushSubscribeRequest
{
    public PushSubscribeSub? Subscription { get; set; }
    public int Id { get; set; }
    public int Bn { get; set; }
}

public class PushSubscribeSub
{
    public string Endpoint { get; set; } = "";
    public PushSubscribeKeys? Keys { get; set; }
}

public class PushSubscribeKeys
{
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
}
