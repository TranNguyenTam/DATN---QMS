using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using System.Security.Claims;

namespace Qms.API.Controllers;

/// <summary>
/// Pha 5 — EMR-light: đăng ký BN mới + BHYT + tiếp nhận có lý do/BS chỉ định + chỉ định CLS.
/// </summary>
[ApiController]
[Route("api/v1/emr")]
[Authorize]
public class EmrController : ControllerBase
{
    private readonly IEmrService _svc;
    public EmrController(IEmrService svc) => _svc = svc;

    private int OpId()
    {
        foreach (var k in new[] { "userId", "UserId", "user_id", ClaimTypes.NameIdentifier })
            if (int.TryParse(User.FindFirstValue(k), out var id) && id > 0) return id;
        return 0;
    }

    [HttpGet("danh-muc-doi-tuong")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDanhMucDoiTuong()
        => Ok(new ApiResponseDto<object>(await _svc.GetDanhMucDoiTuongAsync()));

    [HttpGet("dich-vu-search")]
    public async Task<ActionResult<ApiResponseDto<object>>> SearchDichVu(
        [FromQuery] string? q,
        [FromQuery] int limit = 20)
        => Ok(new ApiResponseDto<object>(await _svc.SearchDichVuAsync(q, limit)));

    [HttpGet("benh-nhan/by-ma-y-te")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetByMaYTe([FromQuery] string maYTe)
    {
        if (string.IsNullOrWhiteSpace(maYTe))
            return Ok(new ApiResponseDto<object>(null) { Message = "Thiếu mã y tế" });
        var res = await _svc.GetBenhNhanByMaYTeAsync(maYTe.Trim());
        return Ok(new ApiResponseDto<object>
        {
            Data = res,
            Message = res == null ? "Không tìm thấy bệnh nhân" : null,
        });
    }

    [HttpPost("benh-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> CreateBenhNhan([FromBody] CreateBenhNhanRequest req)
    {
        var res = await _svc.CreateBenhNhanAsync(req.BenhNhan, req.Bhyt, OpId());
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpPost("tiep-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> CreateTiepNhan([FromBody] TiepNhanCreateReq req)
    {
        var res = await _svc.CreateTiepNhanAsync(req, OpId());
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpPost("chi-dinh-cls")]
    public async Task<ActionResult<ApiResponseDto<object>>> ChiDinhCls([FromBody] ChiDinhClsReq req)
    {
        var res = await _svc.ChiDinhClsAsync(req, OpId());
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpGet("tiep-nhan/{id:int}/cls")]
    public async Task<ActionResult<ApiResponseDto<object>>> ListClsByTiepNhan(int id)
        => Ok(new ApiResponseDto<object>(await _svc.ListDichVuYeuCauByTiepNhanAsync(id)));

    // ── Pha 6: Quản lý bệnh nhân ─────────────────────────────────

    /// <summary>List BN paged + filter (search/đối tượng/giới tính).</summary>
    [HttpGet("benh-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> ListBenhNhan(
        [FromQuery] string? q,
        [FromQuery] int? doiTuongId,
        [FromQuery] int? gioiTinh,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var res = await _svc.ListBenhNhanAsync(q, doiTuongId, gioiTinh, page, pageSize);
        return Ok(new ApiResponseDto<object>(res));
    }

    /// <summary>Chi tiết BN + BHYT mới nhất.</summary>
    [HttpGet("benh-nhan/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetBenhNhanDetail(int id)
    {
        var res = await _svc.GetBenhNhanDetailAsync(id);
        return Ok(new ApiResponseDto<object>
        {
            Data = res,
            Message = res == null ? "Không tìm thấy bệnh nhân" : null,
        });
    }

    /// <summary>Lịch sử tiếp nhận của BN.</summary>
    [HttpGet("benh-nhan/{id:int}/tiep-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetTiepNhanHistory(int id)
        => Ok(new ApiResponseDto<object>(await _svc.ListTiepNhanByBenhNhanAsync(id)));

    /// <summary>Update info BN + BHYT (atomic).</summary>
    [HttpPut("benh-nhan/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> UpdateBenhNhan(int id, [FromBody] BenhNhanUpdateReq req)
    {
        var ok = await _svc.UpdateBenhNhanAsync(id, req, OpId());
        return Ok(new ApiResponseDto<object>(new { ok }));
    }

    /// <summary>Soft delete BN (ACTIVE='0' — KHÔNG xóa row).</summary>
    [HttpDelete("benh-nhan/{id:int}")]
    public async Task<ActionResult<ApiResponseDto<object>>> SoftDeleteBenhNhan(int id)
    {
        var ok = await _svc.SoftDeleteBenhNhanAsync(id, OpId());
        return Ok(new ApiResponseDto<object>(new { ok }));
    }
}

/// <summary>Wrapper request cho POST /benh-nhan vì 2 phần (BN + BHYT) gửi cùng body.</summary>
public class CreateBenhNhanRequest
{
    public BenhNhanCreateReq BenhNhan { get; set; } = new();
    public BhytInfo? Bhyt { get; set; }
}
