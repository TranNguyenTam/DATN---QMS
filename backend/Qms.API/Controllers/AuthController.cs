using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public async Task<ActionResult<ApiResponseDto<AuthRes>>> Login([FromBody] LoginRequest req)
    {
        var result = await _authService.LoginAsync(req.Username, req.Password);
        return Ok(new ApiResponseDto<AuthRes>(result));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<ApiResponseDto<AuthRes>>> GetCurrentUser()
    {
        var userCode = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userCode))
            return Unauthorized();

        var result = await _authService.LoadSessionAsync(userCode);
        return Ok(new ApiResponseDto<AuthRes>(result));
    }

    [HttpPost("refresh-token")]
    public async Task<ActionResult<ApiResponseDto<AuthRes>>> RefreshToken([FromBody] RefreshTokenRequest req)
    {
        var result = await _authService.RefreshTokenAsync(req.RefreshToken);
        return Ok(new ApiResponseDto<AuthRes>(result));
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<ActionResult<ApiResponseDto<object>>> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        var userIdStr = User.FindFirstValue("userId")
            ?? User.FindFirstValue("UserId")
            ?? User.FindFirstValue("user_id");
        if (!int.TryParse(userIdStr, out var userId) || userId <= 0)
            return Unauthorized();

        var (ok, message) = await _authService.ChangePasswordAsync(userId, req.OldPassword ?? "", req.NewPassword ?? "");
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }
}
