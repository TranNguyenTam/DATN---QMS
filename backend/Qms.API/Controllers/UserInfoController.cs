using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/user")]
public class UserInfoController : ControllerBase
{
    private readonly IUserInfoService _userInfoService;

    public UserInfoController(IUserInfoService userInfoService)
    {
        _userInfoService = userInfoService;
    }

    [HttpGet("info")]
    [Authorize]
    public async Task<ActionResult<ApiResponseDto<object>>> GetInfoUser()
    {
        var userCode = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userCode))
        {
            return Unauthorized();
        }

        var result = await _userInfoService.GetInfoUserAsync(userCode);
        return Ok(new ApiResponseDto<object>(result));
    }
}
