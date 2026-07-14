using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.API.Services;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/vien-phi")]
[Authorize]
public class VienPhiController : ControllerBase
{
    private readonly IHangDoiPhongBanService _hangDoiPhongBanService;
    private readonly ISocketService _socketService;
    private readonly IQueueScopeGuard _guard;

    public VienPhiController(
        IHangDoiPhongBanService hangDoiPhongBanService,
        ISocketService socketService,
        IQueueScopeGuard guard)
    {
        _hangDoiPhongBanService = hangDoiPhongBanService;
        _socketService = socketService;
        _guard = guard;
    }

    [HttpGet("check-barcode")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckBarcode([FromQuery] string soPhieu)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiPhongBanService.CheckSoPhieuYeuCauNhanBenhVienPhiAsync(soPhieu)));
    }

    [HttpPost("insert")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckIn([FromBody] ThemBnCheckInVpReq req)
    {
        var res = await _hangDoiPhongBanService.ThemBnCheckInVPAsync(req);
        
        var payload = new WSocketPayload
        {
            Event = "NHAN_BN",
            HangDoiId = req.HangDoiId,
            PhongBanId = null
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpGet("dang-goi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHangDoiPhongBan(
        [FromQuery] int phongBanId,
        [FromQuery] int hangDoiId = 0)
    {
        var res = hangDoiId > 0
            ? await _hangDoiPhongBanService.ShowSTTDaThucHienLoadByHangDoiAsync(hangDoiId, phongBanId)
            : await _hangDoiPhongBanService.ShowSTTDaThucHienLoadAsync(phongBanId);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpGet("hang-cho")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDsHangCho([FromQuery] int hangDoiId)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiPhongBanService.SelectDanhSachHangDoiTheoHangDoiIDAsync(hangDoiId)));
    }

    [HttpGet("da-goi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDsDaGoi([FromQuery] int hangDoiId, [FromQuery] int phongBanId)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiPhongBanService.SelectDaGoiTrongNgayAsync(hangDoiId, phongBanId)));
    }

    [HttpPost("goi-bn")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiBenhNhanTiepTheo([FromBody] GoiTiepTheoRequest req)
    {
        await _guard.EnsureAsync(User, req.HangDoiId, req.PhongBanId);
        var res = await _hangDoiPhongBanService.ProcessMoiBNAsync(req.HangDoiId, req.PhongBanId);

        var payload = new WSocketPayload
        {
            Event = EventSocket.GOI_BN,
            HangDoiId = req.HangDoiId,
            PhongBanId = req.PhongBanId
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpPost("goi-lai/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiLaiBN(int hangDoiPhongBanId, [FromQuery] int phongBanId)
    {
        await _guard.EnsureAsync(User, 0, phongBanId);
        var res = await _hangDoiPhongBanService.ShowSTTDaThucHienLoadAsync(phongBanId);
        var payload = new WSocketPayload
        {
            Event = EventSocket.GOI_LAI,
            HangDoiId = null,
            PhongBanId = phongBanId
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    public class VienPhiBoQuaReq
    {
        public int HangDoiPhongBanId { get; set; }
        public int PhongBanId { get; set; }
    }

    [HttpPut("bo-qua")]
    public async Task<ActionResult<ApiResponseDto<object>>> BoQuaBN([FromBody] VienPhiBoQuaReq req)
    {
        await _guard.EnsureAsync(User, 0, req.PhongBanId);
        var res = await _hangDoiPhongBanService.ProcessBoQuaBNAsync(req.HangDoiPhongBanId, req.PhongBanId);

        var payload = new WSocketPayload
        {
            Event = EventSocket.BO_QUA,
            HangDoiId = null,
            PhongBanId = req.PhongBanId
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpGet("chay-chu-ds-cho")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetChayChuDsCho([FromQuery] int hangDoiId)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiPhongBanService.ChayChuDanhSachChoAsync(hangDoiId)));
    }

    // Resolve TiepNhan_Id + BenhNhan_Id của BN đang gọi (để mở hoá đơn viện phí).
    [HttpGet("thanh-toan-info/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> ThanhToanInfo(int hangDoiPhongBanId)
        => Ok(new ApiResponseDto<object>(await _hangDoiPhongBanService.GetThanhToanInfoAsync(hangDoiPhongBanId)));

    // Thu ngân bấm "Thu xong": đóng lượt viện phí + tự đẩy Nhà thuốc nếu có đơn thuốc.
    [HttpPut("hoan-tat/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> HoanTatThuTien(int hangDoiPhongBanId)
    {
        var res = await _hangDoiPhongBanService.HoanTatThuTienAsync(hangDoiPhongBanId);
        // Refresh hàng đợi Viện phí (4/8) + Nhà thuốc (5/9).
        await _socketService.SendPublicMessageAsync(new WSocketPayload { Event = "NHAN_BN", HangDoiId = 4, PhongBanId = 8 });
        await _socketService.SendPublicMessageAsync(new WSocketPayload { Event = "NHAN_BN", HangDoiId = 5, PhongBanId = 9 });
        return Ok(new ApiResponseDto<object>(res));
    }
}
