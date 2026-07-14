using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using Qms.Core.Exceptions;
using Qms.Services.Interfaces;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/kham-benh")]
[Authorize]
public class KhamBenhController : ControllerBase
{
    private readonly IHangDoiPhongBanService _svc;
    private readonly ISocketService _socket;
    private readonly IQueueScopeGuard _guard;

    public KhamBenhController(IHangDoiPhongBanService svc, ISocketService socket, IQueueScopeGuard guard)
    {
        _svc = svc;
        _socket = socket;
        _guard = guard;
    }

    // GET /api/v1/kham-benh/dang-goi?phongBanId=&hangDoiId=
    [HttpGet("dang-goi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDangGoi(
        [FromQuery] int phongBanId,
        [FromQuery] int hangDoiId = 0)
    {
        var res = hangDoiId > 0
            ? await _svc.ShowSTTDaThucHienLoadByHangDoiAsync(hangDoiId, phongBanId)
            : await _svc.ShowSTTDaThucHienLoadAsync(phongBanId);
        return Ok(new ApiResponseDto<object>(res));
    }

    // GET /api/v1/kham-benh/hang-cho?hangDoiId=
    [HttpGet("hang-cho")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHangCho([FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _svc.SelectDanhSachHangDoiTheoHangDoiIDAsync(hangDoiId)));

    // GET /api/v1/kham-benh/danh-sach-benh-nhan?phongBanId=
    // phongBanId > 0 → chỉ BN phòng khám của bác sĩ đang login; 0 (ADMIN) → tất cả.
    [HttpGet("danh-sach-benh-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDanhSachBenhNhan([FromQuery] int phongBanId = 0)
        => Ok(new ApiResponseDto<object>(await _svc.DanhSachBenhNhanAsync(phongBanId)));

    // GET /api/v1/kham-benh/da-goi?hangDoiId=&phongBanId=
    [HttpGet("da-goi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDaGoi([FromQuery] int hangDoiId, [FromQuery] int phongBanId)
        => Ok(new ApiResponseDto<object>(await _svc.SelectDanhSachHangDoiPhongBanIDDaThucHienAsync(hangDoiId, phongBanId)));

    // POST /api/v1/kham-benh/goi-bn
    [HttpPost("goi-bn")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiBenhNhanTiepTheo([FromBody] GoiTiepTheoRequest req)
    {
        await _guard.EnsureAsync(User, req.HangDoiId, req.PhongBanId);
        var res = await _svc.ProcessMoiBNAsync(req.HangDoiId, req.PhongBanId);
        var list = System.Linq.Enumerable.ToList(res);
        if (list.Count > 0)
            await _socket.SendAsync("GOI_BN", req.HangDoiId, req.PhongBanId);
        return Ok(new ApiResponseDto<object>(list));
    }

    // POST /api/v1/kham-benh/goi-lai/{hangDoiPhongBanId}?phongBanId=&hangDoiId=
    [HttpPost("goi-lai/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiLaiBN(
        int hangDoiPhongBanId,
        [FromQuery] int phongBanId = 0,
        [FromQuery] int hangDoiId = 0)
    {
        if (phongBanId <= 0)
        {
            var claim = User.FindFirstValue("phongBanId");
            phongBanId = claim != null ? int.Parse(claim) : 0;
        }

        await _guard.EnsureAsync(User, hangDoiId, phongBanId);
        var result = await _svc.ProcessGoiLaiBNAsync(hangDoiPhongBanId, phongBanId);
        var resultType = result.GetType();
        string action = resultType.GetProperty("action")?.GetValue(result)?.ToString() ?? "NONE";
        object data = resultType.GetProperty("data")?.GetValue(result) ?? new List<object>();

        if (action == "GOI_BN" || action == "GOI_LAI")
            await _socket.SendAsync(action, hangDoiId > 0 ? hangDoiId : (int?)null, phongBanId);

        return Ok(new ApiResponseDto<object>(data));
    }

    // PUT /api/v1/kham-benh/bo-qua
    [HttpPut("bo-qua")]
    public async Task<ActionResult<ApiResponseDto<object>>> BoQuaBN([FromBody] BoQuaRequest req)
    {
        await _guard.EnsureAsync(User, req.HangDoiId ?? 0, req.PhongBanId);
        var res = await _svc.ProcessBoQuaBNAsync(req.HangDoiPhongBanId, req.PhongBanId);
        var list = System.Linq.Enumerable.ToList(res);
        if (list.Count > 0)
            await _socket.SendAsync("BO_QUA", req.HangDoiId, req.PhongBanId);
        return Ok(new ApiResponseDto<object>(list));
    }

    // PUT /api/v1/kham-benh/chuyen-sang-vp/{id}
    // Chuyển BN sang Viện phí (tạo lượt HD4) + hoàn tất lượt khám (HD3).
    [HttpPut("chuyen-sang-vp/{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> ChuyenSangVP(int id)
    {
        var res = await _svc.ChuyenSangVienPhiAsync(id);
        var list = System.Linq.Enumerable.ToList(res);
        await _svc.HoanTatLuotKhamAsync(id);   // đóng lượt khám nguồn
        if (list.Count > 0)
            await _socket.SendAsync("NHAN_BN", 4, null);
        return Ok(new ApiResponseDto<object>(list));
    }

    // PUT /api/v1/kham-benh/chuyen-sang-nt/{id}
    // Chuyển BN sang Nhà thuốc (tạo lượt HD5) + hoàn tất lượt khám (HD3).
    [HttpPut("chuyen-sang-nt/{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> ChuyenSangNT(int id)
    {
        var res = await _svc.ChuyenSangNhaThuocAsync(id);
        var list = System.Linq.Enumerable.ToList(res);
        await _svc.HoanTatLuotKhamAsync(id);   // đóng lượt khám nguồn
        if (list.Count > 0)
            await _socket.SendAsync("NHAN_BN", 5, null);
        return Ok(new ApiResponseDto<object>(list));
    }

    // PUT /api/v1/kham-benh/hoan-tat/{id}
    // Hoàn tất lượt khám KHÔNG chuyển tiếp (BN chỉ khám/tư vấn, không CLS,
    // không đơn, không viện phí). Đóng lượt để BN không kẹt ở "đang khám".
    [HttpPut("hoan-tat/{id}")]
    public async Task<ActionResult<ApiResponseDto<object>>> HoanTatKham(int id)
    {
        int n = await _svc.HoanTatLuotKhamAsync(id);
        await _socket.SendAsync("NHAN_BN", 3, null);
        return Ok(new ApiResponseDto<object>(new { affected = n }));
    }

    // Tivi
    // GET /api/v1/kham-benh/chay-chu-ds-cho?hangDoiId=
    [HttpGet("chay-chu-ds-cho")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetChayChuDsCho([FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _svc.ChayChuDanhSachChoAsync(hangDoiId)));

    // GET /api/v1/kham-benh/hang-cho-tivi?hangDoiId=
    [HttpGet("hang-cho-tivi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHangChoTivi([FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _svc.ShowSTTChuaThucHienTop10Async(hangDoiId)));
}
