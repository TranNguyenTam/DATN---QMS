using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/tiep-nhan")]
[Authorize]
public class TiepNhanController : ControllerBase
{
    private readonly IHangDoiTiepNhanService _hangDoiTiepNhanService;
    private readonly ISocketService _socketService;
    private readonly IHangDoiPhongBanService _hangDoiPhongBanService;

    public TiepNhanController(
        IHangDoiTiepNhanService hangDoiTiepNhanService,
        ISocketService socketService,
        IHangDoiPhongBanService hangDoiPhongBanService)
    {
        _hangDoiTiepNhanService = hangDoiTiepNhanService;
        _socketService = socketService;
        _hangDoiPhongBanService = hangDoiPhongBanService;
    }

    [HttpGet("quay")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetCBBQuay()
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanService.CBBQuayAsync(userId)));
    }

    [HttpGet("hang-doi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetCBBHangDoi()
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanService.CBBHangDoiAsync(userId)));
    }

    [HttpGet("hang-doi/{id}/danhsach")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDanhSachTheoHangDoi(int id)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanService.HangDoi_detail_selectAsync(id)));
    }

    [HttpGet("moi-bn")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetMoiBenhNhan([FromQuery] int hangdoi_id, [FromQuery] int quay_id)
    {
        var res = await _hangDoiTiepNhanService.Select_MoiBNAsync(hangdoi_id, quay_id);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpGet("benh-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetTenBenhNhan([FromQuery] string stt, [FromQuery] int hangdoi_id)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanService.Select_MoiBN_TenBenhNhanAsync(hangdoi_id, stt)));
    }

    [HttpGet("report/chua-tiep-nhan")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetSoBenhNhanChuaTN()
    {
        int userId = int.TryParse(User.FindFirstValue("UserId"), out int uid) ? uid : 1;
        return Ok(new ApiResponseDto<object>(await _hangDoiTiepNhanService.BaoCaoTongSoBNChuaTNAsync(userId)));
    }

    [HttpPost("goi-moi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiBenhNhanTiepTheo([FromBody] GoiTiepTheoRequest req)
    {
        var res = await _hangDoiTiepNhanService.update_MoiBNAsync(req);
        
        var payload = new WSocketPayload
        {
            HangDoiId = req.HangDoiId,
            PhongBanId = req.PhongBanId,
            Event = EventSocket.GOI_BN
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpPut("bo-qua/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> BoQuaTiepNhan(
        [FromBody] UpdateBNRequest req,
        int hangDoiPhongBanId)
    {
        var res = await _hangDoiPhongBanService.BoQuaBnCheckInAsync(hangDoiPhongBanId, req);
        var payload = new WSocketPayload
        {
            HangDoiId = req.HangDoiId,
            PhongBanId = req.PhongBanId,
            Event = EventSocket.BO_QUA
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpDelete("{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> DeleteTiepNhan(int hangDoiPhongBanId)
    {
        var res = await _hangDoiPhongBanService.DeleteBnCheckInAsync(hangDoiPhongBanId);
        var payload = new WSocketPayload
        {
            HangDoiId = null,
            PhongBanId = null,
            Event = EventSocket.XOA_BN
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpPost("goi-lai")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiLaiBN([FromBody] GoiTiepTheoRequest req)
    {
        var res = await _hangDoiTiepNhanService.Select_MoiBNAsync(req.HangDoiId, req.PhongBanId);
        
        var payload = new WSocketPayload
        {
            HangDoiId = req.HangDoiId,
            PhongBanId = req.PhongBanId,
            Event = EventSocket.GOI_LAI
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

    [HttpPost("goi-lai/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiLaiBNTheoId(
        int hangDoiPhongBanId,
        [FromBody] GoiTiepTheoRequest req)
    {
        var res = await _hangDoiPhongBanService.GoiBenhNhanAsync(hangDoiPhongBanId, req.PhongBanId);

        var payload = new WSocketPayload
        {
            HangDoiId = req.HangDoiId,
            PhongBanId = req.PhongBanId,
            Event = EventSocket.GOI_LAI
        };
        await _socketService.SendPublicMessageAsync(payload);
        return Ok(new ApiResponseDto<object>(res));
    }

}
