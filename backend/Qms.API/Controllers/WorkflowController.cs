using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;

namespace Qms.API.Controllers;

[ApiController]
[Authorize]
public class WorkflowController : ControllerBase
{
    private readonly IWorkflowService _svc;
    public WorkflowController(IWorkflowService svc) => _svc = svc;

    private (int uid, string? name) GetUser()
    {
        int uid = 0;
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? User.FindFirst("sub")?.Value ?? User.FindFirst("userId")?.Value;
        if (sub != null) int.TryParse(sub, out uid);
        var name = User.FindFirst(ClaimTypes.Name)?.Value ?? User.FindFirst("name")?.Value;
        return (uid, name);
    }

    // ── CLS / CDHA ───────────────────────────────────────────────

    [HttpGet("api/v1/cls/cho-tra-kq/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetClsPending(int hangDoiPhongBanId)
    {
        var row = await _svc.GetCLSPendingByHdpbAsync(hangDoiPhongBanId);
        if (row == null) return NotFound();
        return Ok(new ApiResponseDto<object>(row));
    }

    [HttpPost("api/v1/cls/tra-kq")]
    public async Task<ActionResult<ApiResponseDto<object>>> TraKq([FromBody] TraKetQuaCLSReq req)
    {
        var (uid, name) = GetUser();
        try
        {
            int id = await _svc.TraKetQuaCLSAsync(req, uid, name);
            return Ok(new ApiResponseDto<object>(new { ketQuaId = id }));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponseDto<object> { Message = ex.Message });
        }
    }

    // ── Viện phí ─────────────────────────────────────────────────

    [HttpGet("api/v1/vien-phi/hoa-don/{tiepNhanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHoaDon(int tiepNhanId)
    {
        var data = await _svc.GetHoaDonDraftAsync(tiepNhanId);
        if (data == null) return NotFound();
        return Ok(new ApiResponseDto<object>(data));
    }

    // Danh sách hoá đơn đã thu hôm nay (xem lại / in lại).
    [HttpGet("api/v1/vien-phi/hoa-don-da-thu")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHoaDonDaThu()
        => Ok(new ApiResponseDto<object>(await _svc.GetHoaDonDaThuAsync()));

    [HttpPost("api/v1/vien-phi/lap-hoa-don")]
    public async Task<ActionResult<ApiResponseDto<object>>> LapHoaDon([FromBody] LapHoaDonReq req)
    {
        var (uid, name) = GetUser();
        try
        {
            int id = await _svc.LapHoaDonAsync(req, uid, name);
            return Ok(new ApiResponseDto<object>(new { hoaDonId = id }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponseDto<object> { Message = ex.Message });
        }
    }

    [HttpPost("api/v1/vien-phi/thu-tien")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThuTien([FromBody] ThuTienReq req)
    {
        var (uid, name) = GetUser();
        try
        {
            bool ok = await _svc.ThuTienAsync(req, uid, name);
            return Ok(new ApiResponseDto<object>(new { success = ok }));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponseDto<object> { Message = ex.Message });
        }
    }

    // ── Nhà thuốc ────────────────────────────────────────────────

    [HttpGet("api/v1/nha-thuoc/don/{benhNhanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDonChoPhat(int benhNhanId)
    {
        var rows = await _svc.GetDonThuocChoPhatAsync(benhNhanId);
        return Ok(new ApiResponseDto<object>(rows));
    }

    [HttpPost("api/v1/nha-thuoc/da-phat")]
    public async Task<ActionResult<ApiResponseDto<object>>> DaPhat([FromBody] PhatThuocReq req)
    {
        var (uid, name) = GetUser();
        try
        {
            bool ok = await _svc.PhatThuocAsync(req, uid, name);
            return Ok(new ApiResponseDto<object>(new { success = ok }));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponseDto<object> { Message = ex.Message });
        }
    }
}
