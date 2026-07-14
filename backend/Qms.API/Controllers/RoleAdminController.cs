using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;

namespace Qms.API.Controllers;

[ApiController]
[Authorize(Roles = "ADMIN")]
[Route("api/v1/admin/roles")]
public class RoleAdminController : ControllerBase
{
    private readonly IRoleService _svc;
    public RoleAdminController(IRoleService svc) => _svc = svc;

    public class CreateReq { public string Code { get; set; } = ""; public string Name { get; set; } = ""; public string? Description { get; set; } }
    public class UpdateReq { public string Name { get; set; } = ""; public string? Description { get; set; } public bool? TamNgung { get; set; } }
    public class AssignReq { public int UserId { get; set; } public int RoleId { get; set; } }
    public class SetPermReq { public List<string> PermissionKeys { get; set; } = new(); }

    [HttpGet]
    public async Task<ActionResult<ApiResponseDto<object>>> List()
        => Ok(new ApiResponseDto<object>(await _svc.ListRolesAsync()));

    [HttpGet("users")]
    public async Task<ActionResult<ApiResponseDto<object>>> ListUsers()
        => Ok(new ApiResponseDto<object>(await _svc.ListUsersWithRolesAsync()));

    [HttpGet("{roleId}/permissions")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetPerms(int roleId)
        => Ok(new ApiResponseDto<object>(await _svc.GetPermissionsOfRoleAsync(roleId)));

    [HttpPost]
    public async Task<ActionResult<ApiResponseDto<object>>> Create([FromBody] CreateReq req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new ApiResponseDto<object> { Message = "Thiếu Code/Name" });
        int id = await _svc.CreateRoleAsync(req.Code.Trim().ToUpper(), req.Name, req.Description);
        return Ok(new ApiResponseDto<object>(new { roleId = id }));
    }

    [HttpPut("{roleId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Update(int roleId, [FromBody] UpdateReq req)
    {
        bool ok = await _svc.UpdateRoleAsync(roleId, req.Name, req.Description, req.TamNgung);
        return Ok(new ApiResponseDto<object>(new { success = ok }));
    }

    [HttpDelete("{roleId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Delete(int roleId)
    {
        bool ok = await _svc.DeleteRoleAsync(roleId);
        if (!ok) return BadRequest(new ApiResponseDto<object> { Message = "Không thể xóa (ADMIN hoặc role không tồn tại)" });
        return Ok(new ApiResponseDto<object>(new { success = true }));
    }

    [HttpPost("assign")]
    public async Task<ActionResult<ApiResponseDto<object>>> Assign([FromBody] AssignReq req)
    {
        await _svc.AssignUserRoleAsync(req.UserId, req.RoleId);
        return Ok(new ApiResponseDto<object>(new { success = true }));
    }

    [HttpPost("unassign")]
    public async Task<ActionResult<ApiResponseDto<object>>> Unassign([FromBody] AssignReq req)
    {
        await _svc.RemoveUserRoleAsync(req.UserId, req.RoleId);
        return Ok(new ApiResponseDto<object>(new { success = true }));
    }

    [HttpPut("{roleId}/permissions")]
    public async Task<ActionResult<ApiResponseDto<object>>> SetPerms(int roleId, [FromBody] SetPermReq req)
    {
        await _svc.SetRolePermissionsAsync(roleId, req.PermissionKeys);
        return Ok(new ApiResponseDto<object>(new { success = true }));
    }
}
