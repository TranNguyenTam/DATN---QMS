using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;

namespace Qms.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/benh-an")]
public class BenhAnController : ControllerBase
{
    private readonly IBenhAnService _svc;
    public BenhAnController(IBenhAnService svc) => _svc = svc;

    private (int userId, string? userName) GetUser()
    {
        int uid = 0;
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? User.FindFirst("sub")?.Value
                  ?? User.FindFirst("userId")?.Value;
        if (sub != null) int.TryParse(sub, out uid);
        var name = User.FindFirst(ClaimTypes.Name)?.Value
                   ?? User.FindFirst("name")?.Value;
        return (uid, name);
    }

    /// <summary>POST /api/v1/benh-an — tạo bệnh án + chỉ định CLS + đơn thuốc.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponseDto<object>>> Create([FromBody] BenhAnCreateReq req)
    {
        var (uid, uname) = GetUser();
        try
        {
            var result = await _svc.CreateBenhAnAsync(req, uid, uname);
            // Trả benhAnId + danh sách phiếu CLS/CDHA để FE in (kèm QR số phiếu).
            return Ok(new ApiResponseDto<object>(new { benhAnId = result.BenhAn_Id, phieus = result.Phieus }));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new ApiResponseDto<object> { Message = ex.Message });
        }
    }

    /// <summary>GET /api/v1/benh-an/{id} — chi tiết bệnh án + chỉ định + thuốc.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> Detail(int id)
    {
        var detail = await _svc.GetBenhAnDetailAsync(id);
        if (detail == null) return NotFound();
        return Ok(new ApiResponseDto<object>(detail));
    }

    /// <summary>GET /api/v1/benh-an/by-hdpb/{hangDoiPhongBanId} — bệnh án của lượt
    /// khám (để màn Khám load lại form sửa). 204 nếu chưa có bệnh án.</summary>
    [HttpGet("by-hdpb/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> ByHangDoiPhongBan(int hangDoiPhongBanId)
    {
        var detail = await _svc.GetBenhAnByHangDoiPhongBanAsync(hangDoiPhongBanId);
        return Ok(new ApiResponseDto<object>(detail));
    }

    /// <summary>GET /api/v1/benh-an/lich-su?benhNhanId=&top= — lịch sử BN.</summary>
    [HttpGet("lich-su")]
    public async Task<ActionResult<ApiResponseDto<object>>> LichSu(
        [FromQuery] int benhNhanId,
        [FromQuery] int top = 20)
    {
        if (benhNhanId <= 0) return BadRequest(new ApiResponseDto<object> { Message = "Thiếu benhNhanId" });
        var rows = await _svc.GetLichSuByBenhNhanAsync(benhNhanId, top);
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>
    /// GET /api/v1/benh-an/danh-sach?tuNgay=&denNgay=&phongBanId=&keyword=
    /// Danh sách bệnh án đã khám theo khoảng ngày (trang Lịch sử khám bệnh).
    /// Không truyền ngày → mặc định hôm nay.
    /// </summary>
    [HttpGet("danh-sach")]
    public async Task<ActionResult<ApiResponseDto<object>>> DanhSach(
        [FromQuery] DateTime? tuNgay,
        [FromQuery] DateTime? denNgay,
        [FromQuery] int phongBanId = 0,
        [FromQuery] string? keyword = null)
    {
        var today = DateTime.Now.Date;
        var rows = await _svc.GetDanhSachBenhAnAsync(
            tuNgay ?? today, denNgay ?? today, phongBanId, keyword ?? "");
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /api/v1/benh-an/dich-vu?loai=KhamBenh|CLS|CDHA|Thuoc — DM dịch vụ.</summary>
    [HttpGet("dich-vu")]
    public async Task<ActionResult<ApiResponseDto<object>>> DichVu([FromQuery] string loai = "CLS")
    {
        var rows = await _svc.GetDichVuByLoaiAsync(loai);
        return Ok(new ApiResponseDto<object>(rows));
    }

    /// <summary>GET /api/v1/benh-an/tiep-nhan-info/{tiepNhanId} — lý do khám + BS chỉ định
    /// từ phiếu tiếp nhận (để màn bệnh án prefill, bác sĩ khỏi gõ lại).</summary>
    [HttpGet("tiep-nhan-info/{tiepNhanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> TiepNhanInfo(int tiepNhanId)
    {
        if (tiepNhanId <= 0) return BadRequest(new ApiResponseDto<object> { Message = "Thiếu tiepNhanId" });
        var info = await _svc.GetTiepNhanLyDoAsync(tiepNhanId);
        return Ok(new ApiResponseDto<object>(info));
    }
}
