using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/tts")]
[Authorize]
public class TtsController : ControllerBase
{
    private readonly IViettelTtsService _tts;
    private readonly IConfiguration _config;

    public TtsController(IViettelTtsService tts, IConfiguration config)
    {
        _tts = tts;
        _config = config;
    }

    public class TtsTestRequest { public string Text { get; set; } = string.Empty; }

    [HttpGet("config")]
    public ActionResult<ApiResponseDto<object>> GetConfig()
        => Ok(new ApiResponseDto<object>(new
        {
            voice = _config["TtsOptions:ViettelVoice"] ?? "hn-thanhphuong",
            speed = _config.GetValue<double>("TtsOptions:ViettelSpeed", 0.8),
            url = _config["TtsOptions:ViettelUrl"],
            tokenConfigured = !string.IsNullOrWhiteSpace(_config["TtsOptions:ViettelToken"]),
        }));

    [HttpPost("test")]
    public async Task<IActionResult> Test([FromBody] TtsTestRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest(new ApiResponseDto<object>(new { ok = false, message = "Thiếu text" }));
        try
        {
            var audio = await _tts.SynthesizeAsync(req.Text);
            return File(audio, "audio/mpeg", "tts-test.mp3");
        }
        catch (Exception ex)
        {
            return Ok(new ApiResponseDto<object>(new { ok = false, message = ex.Message }));
        }
    }
}
