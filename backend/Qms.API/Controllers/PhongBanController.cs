using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/danh-muc/phong-ban")]
[Authorize]
public class PhongBanController : ControllerBase
{
    private readonly IDanhMucService _danhMucService;

    public PhongBanController(IDanhMucService danhMucService)
    {
        _danhMucService = danhMucService;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponseDto<object>>> GetListPhongBan()
    {
        return Ok(new ApiResponseDto<object>(await _danhMucService.SelectDanhMucPhongBanAsync()));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetPhongBanById(int id)
    {
        return Ok(new ApiResponseDto<object>(await _danhMucService.SelectDanhMucPhongBanTheoIDAsync(id)));
    }

    [HttpGet("loai-phong-ban")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetLoaiPhongBan()
    {
        return Ok(new ApiResponseDto<object>(await _danhMucService.CBBLoaiPhongBanAsync()));
    }

    [HttpPost("create")]
    public async Task<ActionResult<ApiResponseDto<object>>> CreatePhongBan([FromBody] UpdatePhongBanReq req)
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1; // Assuming we can get UserId, else fallback to 1 temporarily
        return Ok(new ApiResponseDto<object>(await _danhMucService.InsertDanhMucPhongBanAsync(userId, req)));
    }

    [HttpPut("update")]
    public async Task<ActionResult<ApiResponseDto<object>>> UpdatePhongBan([FromBody] UpdatePhongBanReq req)
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _danhMucService.UpdateDanhMucPhongBanAsync(userId, req)));
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> DeletePhongBan(int id)
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _danhMucService.DeleteDanhMucPhongBanAsync(userId, id)));
    }
}
