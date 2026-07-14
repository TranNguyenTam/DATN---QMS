using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/system/permission-menu")]
[Authorize]
public class PermissionMenuController : ControllerBase
{
    private readonly IPermissionMenuService _svc;
    public PermissionMenuController(IPermissionMenuService svc) => _svc = svc;

    [HttpGet("users")]
    public async Task<ActionResult<ApiResponseDto<object>>> Users()
        => Ok(new ApiResponseDto<object>(await _svc.UsersAsync()));

    [HttpGet("menus")]
    public async Task<ActionResult<ApiResponseDto<object>>> Menus()
        => Ok(new ApiResponseDto<object>(await _svc.MenusAsync()));

    [HttpGet("user/{userId:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> UserMenus(int userId)
        => Ok(new ApiResponseDto<object>(await _svc.UserMenusAsync(userId)));

    [HttpPost]
    public async Task<ActionResult<ApiResponseDto<object>>> Save([FromBody] PermissionMenuSaveRequest req)
    {
        var (ok, message) = await _svc.SaveAsync(req);
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }
}
