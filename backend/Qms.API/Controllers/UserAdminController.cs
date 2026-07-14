using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using System.Security.Claims;

namespace Qms.API.Controllers;

/// <summary>
/// CRUD người dùng cho màn "Hệ thống ▸ Users".
/// Chuyển thể từ form `HeThong/Users.cs` của WinForms.
/// </summary>
[ApiController]
[Route("api/v1/system/users")]
[Authorize]
public class UserAdminController : ControllerBase
{
    private readonly IUserAdminService _svc;

    public UserAdminController(IUserAdminService svc)
    {
        _svc = svc;
    }

    private int OperatorId()
    {
        foreach (var k in new[] { "userId", "UserId", "user_id", ClaimTypes.NameIdentifier })
        {
            if (int.TryParse(User.FindFirstValue(k), out var id) && id > 0) return id;
        }
        return 0;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponseDto<object>>> List()
        => Ok(new ApiResponseDto<object>(await _svc.ListAsync()));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Get(int id)
    {
        var row = await _svc.GetAsync(id);
        if (row is null) return NotFound(new ApiResponseDto<object>(new { ok = false, message = "Không tìm thấy" }));
        return Ok(new ApiResponseDto<object>(row));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponseDto<object>>> Create([FromBody] UserUpsertRequest req)
    {
        var (ok, message, id) = await _svc.CreateAsync(req, OperatorId());
        return Ok(new ApiResponseDto<object>(new { ok, message, id }));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Update(int id, [FromBody] UserUpsertRequest req)
    {
        var (ok, message) = await _svc.UpdateAsync(id, req, OperatorId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Delete(int id)
    {
        var (ok, message) = await _svc.DeleteAsync(id, OperatorId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }
}
