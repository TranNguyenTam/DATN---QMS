using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using System.Security.Claims;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/system/menus")]
[Authorize]
public class MenuAdminController : ControllerBase
{
    private readonly IMenuAdminService _svc;
    public MenuAdminController(IMenuAdminService svc) => _svc = svc;

    private int OpId()
    {
        foreach (var k in new[] { "userId", "UserId", "user_id", ClaimTypes.NameIdentifier })
            if (int.TryParse(User.FindFirstValue(k), out var id) && id > 0) return id;
        return 0;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponseDto<object>>> List()
        => Ok(new ApiResponseDto<object>(await _svc.ListAsync()));

    [HttpGet("parents")]
    public async Task<ActionResult<ApiResponseDto<object>>> Parents()
        => Ok(new ApiResponseDto<object>(await _svc.ParentOptionsAsync()));

    [HttpPost]
    public async Task<ActionResult<ApiResponseDto<object>>> Create([FromBody] MenuUpsertRequest req)
    {
        var (ok, message) = await _svc.CreateAsync(req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Update(int id, [FromBody] MenuUpsertRequest req)
    {
        var (ok, message) = await _svc.UpdateAsync(id, req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Delete(int id)
    {
        var (ok, message) = await _svc.DeleteAsync(id, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }
}
