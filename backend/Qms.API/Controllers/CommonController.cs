using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/common")]
public class CommonController : ControllerBase
{
    private readonly DeviceRegistry _deviceRegistry;
    private readonly ICommonService _commonService;
    private readonly IViettelTtsService _ttsService;

    public CommonController(DeviceRegistry deviceRegistry, ICommonService commonService, IViettelTtsService ttsService)
    {
        _deviceRegistry = deviceRegistry;
        _commonService = commonService;
        _ttsService = ttsService;
    }

    [HttpGet("device")]
    [Authorize]
    public ActionResult<ApiResponseDto<object>> GetDeviceByName()
    {
        var tenTivi = User.FindFirstValue("TenTivi")
            ?? User.FindFirstValue("UserCode")
            ?? "";
        return Ok(new ApiResponseDto<object>(_deviceRegistry.GetAllByName(tenTivi)));
    }

    [HttpGet("gioi-thieu")]
    [Authorize]
    public async Task<ActionResult<ApiResponseDto<object>>> GetGioiThieu()
    {
        return Ok(new ApiResponseDto<object>(await _commonService.NoiDungGioiThieuAsync()));
    }

    [HttpGet("hang-doi")]
    [Authorize]
    public async Task<ActionResult<ApiResponseDto<object>>> GetCBBHangDoi()
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _commonService.CBBHangDoiAsync(userId)));
    }

    [HttpPost("tts")]
    [Authorize]
    public async Task<IActionResult> Tts([FromBody] TtsRequest req)
    {
        // Viettel có thể down hoặc thiếu token — trả 204 để FE biết
        // không có audio và tự fallback Web Speech API của browser.
        try
        {
            var audio = await _ttsService.SynthesizeAsync(req.Text);
            return File(audio, "audio/mpeg");
        }
        catch (InvalidOperationException)
        {
            return NoContent();
        }
    }

    [HttpGet("tts-test")]
    [Authorize]
    public async Task<IActionResult> TtsTest([FromQuery] string text = "Moi benh nhan vao phong kham")
    {
        try
        {
            var audio = await _ttsService.SynthesizeAsync(text);
            return File(audio, "audio/mpeg");
        }
        catch (InvalidOperationException)
        {
            return NoContent();
        }
    }
}
