using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/danh-muc/hang-doi")]
[Authorize]
public class HangDoiController : ControllerBase
{
    private readonly IDanhMucService _danhMucService;

    public HangDoiController(IDanhMucService danhMucService)
    {
        _danhMucService = danhMucService;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponseDto<object>>> GetListHangDoi()
    {
        return Ok(new ApiResponseDto<object>(await _danhMucService.SelectDanhMucHangDoiAsync()));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHangDoiById(int id)
    {
        return Ok(new ApiResponseDto<object>(await _danhMucService.SelectDanhMucHangDoiTheoIDAsync(id)));
    }

    [HttpPost("create")]
    public async Task<ActionResult<ApiResponseDto<object>>> CreateHangDoi([FromBody] UpdateHangDoiReq req)
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _danhMucService.InsertDanhMucHangDoiAsync(userId, req)));
    }

    [HttpPut("update")]
    public async Task<ActionResult<ApiResponseDto<object>>> UpdateHangDoi([FromBody] UpdateHangDoiReq req)
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _danhMucService.UpdateDanhMucHangDoiAsync(userId, req)));
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> DeleteHangDoi(int id)
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _danhMucService.DeleteDanhMucHangDoiAsync(userId, id)));
    }
}
