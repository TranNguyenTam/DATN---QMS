using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using System.Security.Claims;

namespace Qms.API.Controllers;

/// <summary>
/// Các mục quản trị danh mục cao cấp: Nội dung đặc biệt, Thời gian thực hiện DV,
/// Phân quyền User - Phòng ban - Hàng đợi.
/// </summary>
[ApiController]
[Route("api/v1/danh-muc/admin")]
[Authorize]
public class DanhMucAdminController : ControllerBase
{
    private readonly IDanhMucAdminService _svc;
    public DanhMucAdminController(IDanhMucAdminService svc) => _svc = svc;

    private int OpId()
    {
        foreach (var k in new[] { "userId", "UserId", "user_id", ClaimTypes.NameIdentifier })
            if (int.TryParse(User.FindFirstValue(k), out var id) && id > 0) return id;
        return 0;
    }

    // Nội dung đặc biệt
    [HttpGet("noi-dung-dac-biet")]
    public async Task<ActionResult<ApiResponseDto<object>>> NoiDungList()
        => Ok(new ApiResponseDto<object>(await _svc.NoiDungListAsync()));

    [HttpGet("cbb/hang-doi-phong-ban")]
    public async Task<ActionResult<ApiResponseDto<object>>> CbbHangDoiPhongBan()
        => Ok(new ApiResponseDto<object>(await _svc.HangDoiPhongBanOptionsAsync()));

    [HttpGet("cbb/hang-doi")]
    public async Task<ActionResult<ApiResponseDto<object>>> CbbHangDoi()
        => Ok(new ApiResponseDto<object>(await _svc.HangDoiOptionsAsync()));

    [HttpPost("noi-dung-dac-biet")]
    public async Task<ActionResult<ApiResponseDto<object>>> NoiDungCreate([FromBody] NoiDungDacBietUpsertRequest req)
    {
        var (ok, message) = await _svc.NoiDungCreateAsync(req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpPut("noi-dung-dac-biet/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> NoiDungUpdate(int id, [FromBody] NoiDungDacBietUpsertRequest req)
    {
        var (ok, message) = await _svc.NoiDungUpdateAsync(id, req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpDelete("noi-dung-dac-biet/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> NoiDungDelete(int id)
    {
        var (ok, message) = await _svc.NoiDungDeleteAsync(id, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    // Thời gian thực hiện DV
    [HttpGet("thoi-gian")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThoiGianList()
        => Ok(new ApiResponseDto<object>(await _svc.ThoiGianListAsync()));

    [HttpGet("cbb/dich-vu")]
    public async Task<ActionResult<ApiResponseDto<object>>> CbbDichVu()
        => Ok(new ApiResponseDto<object>(await _svc.DichVuOptionsAsync()));

    [HttpPost("thoi-gian")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThoiGianCreate([FromBody] ThoiGianDichVuUpsertRequest req)
    {
        var (ok, message) = await _svc.ThoiGianCreateAsync(req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpPut("thoi-gian/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThoiGianUpdate(int id, [FromBody] ThoiGianDichVuUpsertRequest req)
    {
        var (ok, message) = await _svc.ThoiGianUpdateAsync(id, req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    [HttpDelete("thoi-gian/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThoiGianDelete(int id)
    {
        var (ok, message) = await _svc.ThoiGianDeleteAsync(id, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }

    // Phân quyền User - PhongBan - HangDoi
    [HttpGet("cbb/users")]
    public async Task<ActionResult<ApiResponseDto<object>>> CbbUsers()
        => Ok(new ApiResponseDto<object>(await _svc.UserOptionsAsync()));

    [HttpGet("phan-quyen/{userId:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetPhanQuyen(int userId)
    {
        var phongBan = await _svc.GetPhongBanOfUserAsync(userId);
        var hangDoi = await _svc.GetHangDoiOfUserAsync(userId);
        return Ok(new ApiResponseDto<object>(new { phongBan, hangDoi }));
    }

    [HttpPost("phan-quyen")]
    public async Task<ActionResult<ApiResponseDto<object>>> SavePhanQuyen([FromBody] PermissionUserPbHdSaveRequest req)
    {
        var (ok, message) = await _svc.SaveUserPhongBanHangDoiAsync(req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok, message }));
    }
}
