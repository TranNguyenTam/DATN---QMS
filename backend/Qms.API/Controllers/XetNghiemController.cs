using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Threading.Tasks;

namespace Qms.API.Controllers;

[ApiController]
[Route("api/v1/xet-nghiem")]
[Authorize]
public class XetNghiemController : ControllerBase
{
    private readonly IHangDoiPhongBanService _hangDoiPhongBanService;

    public XetNghiemController(IHangDoiPhongBanService hangDoiPhongBanService)
    {
        _hangDoiPhongBanService = hangDoiPhongBanService;
    }

    [HttpGet("dang-goi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetSTTDaThucHienLoadXN([FromQuery] int phongBanId)
    {
        return Ok(new ApiResponseDto<object>(await _hangDoiPhongBanService.ShowSTTDaThucHienLoadXetNghiemAsync(phongBanId)));
    }
}
