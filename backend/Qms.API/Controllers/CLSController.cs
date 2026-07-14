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
[Route("api/v1/cls")]
[Authorize]
public class CLSController : ControllerBase
{
    private readonly IHangDoiPhongBanService _svc;
    private readonly ISocketService _socket;
    private readonly IQueueScopeGuard _guard;

    public CLSController(IHangDoiPhongBanService svc, ISocketService socket, IQueueScopeGuard guard)
    {
        _svc = svc;
        _socket = socket;
        _guard = guard;
    }

    // GET /api/v1/cls/check-barcode?soPhieu=&hangDoiId=
    [HttpGet("check-barcode")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckBarcode([FromQuery] string soPhieu, [FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _svc.CheckSoPhieuYeuCauNhanBenhvaInSTTAsync(soPhieu, hangDoiId)));

    // GET /api/v1/cls/noi-tru/danh-sach
    [HttpGet("noi-tru/danh-sach")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDanhSachNoiTru()
        => Ok(new ApiResponseDto<object>(await _svc.DanhSachBenhNhanNoiTruAsync()));

    // GET /api/v1/cls/noi-tru/check-ma?maYTe=
    [HttpGet("noi-tru/check-ma")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckMaNoiTru([FromQuery] string maYTe)
        => Ok(new ApiResponseDto<object>(await _svc.CheckBenhNhanCoCLSNoiTruAsync(maYTe)));

    // POST /api/v1/cls/noi-tru/check-in
    [HttpPost("noi-tru/check-in")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckInNoiTru([FromBody] Dictionary<string, string> body)
    {
        string maYTe = body.TryGetValue("maYTe", out var m) ? m : "";
        var checkRows = System.Linq.Enumerable.ToList(await _svc.CheckBenhNhanCoCLSNoiTruAsync(maYTe));
        if (checkRows.Count == 0)
            return Ok(new ApiResponseDto<object>(new List<object>()));

        var checkInRows = System.Linq.Enumerable.ToList(await _svc.BenhNhanCheckInCLSNoiTruAsync(maYTe));
        if (checkInRows.Count > 0)
            await _socket.SendAsync("NHAN_BN", null, null);

        return Ok(new ApiResponseDto<object>(new { benhNhan = checkRows[0], checkIn = (object)checkInRows }));
    }

    // POST /api/v1/cls/insert
    [HttpPost("insert")]
    public async Task<ActionResult<ApiResponseDto<object>>> CheckIn([FromBody] ThemBnCheckInClsReq req)
    {
        var res = System.Linq.Enumerable.ToList(await _svc.ThemBnCheckInCLSAsync(req));
        if (res.Count > 0)
            await _socket.SendAsync("NHAN_BN", req.HangDoiId, null);
        return Ok(new ApiResponseDto<object>(res));
    }

    // GET /api/v1/cls/dang-goi?phongBanId=&hangDoiId=
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

    // GET /api/v1/cls/hang-cho?hangDoiId=
    [HttpGet("hang-cho")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetHangCho([FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _svc.SelectDanhSachHangDoiTheoHangDoiIDNewAsync(hangDoiId)));

    // GET /api/v1/cls/da-goi?hangDoiId=&phongBanId=
    [HttpGet("da-goi")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetDaGoi([FromQuery] int hangDoiId, [FromQuery] int phongBanId)
        => Ok(new ApiResponseDto<object>(await _svc.SelectDanhSachHangDoiPhongBanIDDaThucHienAsync(hangDoiId, phongBanId)));

    // GET /api/v1/cls/chay-chu-ds-cho?hangDoiId=
    [HttpGet("chay-chu-ds-cho")]
    public async Task<ActionResult<ApiResponseDto<object>>> GetChayChuDsCho([FromQuery] int hangDoiId)
        => Ok(new ApiResponseDto<object>(await _svc.ChayChuDanhSachChoNewAsync(hangDoiId)));

    // POST /api/v1/cls/goi-bn
    [HttpPost("goi-bn")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiBenhNhanTiepTheo([FromBody] GoiTiepTheoCLSRequest req)
    {
        await _guard.EnsureAsync(User, req.HangDoiId, req.PhongBanId);
        var res = System.Linq.Enumerable.ToList(await _svc.ProcessMoiBNCLSAsync(req.HangDoiId, req.PhongBanId, req.HangDoiPhongBanId));
        if (res.Count > 0)
            await _socket.SendAsync("GOI_BN", req.HangDoiId, req.PhongBanId);
        return Ok(new ApiResponseDto<object>(res));
    }

    // POST /api/v1/cls/goi-bn-da-chon
    [HttpPost("goi-bn-da-chon")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiBenhNhanDaChon([FromBody] GoiBenhDaChonCLSRequest req)
    {
        await _guard.EnsureAsync(User, req.HangDoiId, req.PhongBanId);
        var result = await _svc.ProcessGoiBenhNhanDaChonCLSAsync(req.HangDoiPhongBanId, req.PhongBanId);
        var dict = (IDictionary<string, object>)System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(
            System.Text.Json.JsonSerializer.Serialize(result))
            .EnumerateObject()
            .ToDictionary(p => p.Name, p => (object)p.Value);

        // Simpler approach: use anonymous object reflection
        var resultType = result.GetType();
        string action = resultType.GetProperty("action")?.GetValue(result)?.ToString() ?? "NONE";
        object data = resultType.GetProperty("data")?.GetValue(result) ?? new List<object>();

        if (action == "GOI_BN" || action == "GOI_LAI")
            await _socket.SendAsync(action, req.HangDoiId, req.PhongBanId);

        return Ok(new ApiResponseDto<object>(data));
    }

    // POST /api/v1/cls/goi-lai/{hangDoiPhongBanId}
    [HttpPost("goi-lai/{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> GoiLaiBN(int hangDoiPhongBanId)
    {
        var phongBanIdClaim = User.FindFirstValue("phongBanId");
        int phongBanId = phongBanIdClaim != null ? int.Parse(phongBanIdClaim) : 0;
        var res = System.Linq.Enumerable.ToList(await _svc.ShowSTTDaThucHienLoadAsync(phongBanId));
        if (res.Count > 0)
            await _socket.SendAsync("GOI_LAI", null, phongBanId);
        return Ok(new ApiResponseDto<object>(res));
    }

    // PUT /api/v1/cls/bo-qua
    [HttpPut("bo-qua")]
    public async Task<ActionResult<ApiResponseDto<object>>> BoQuaBN([FromBody] BoQuaRequest req)
    {
        await _guard.EnsureAsync(User, req.HangDoiId ?? 0, req.PhongBanId);
        var res = System.Linq.Enumerable.ToList(await _svc.ProcessBoQuaBNAsync(req.HangDoiPhongBanId, req.PhongBanId));
        if (res.Count > 0)
            await _socket.SendAsync("BO_QUA", req.HangDoiId, req.PhongBanId);
        return Ok(new ApiResponseDto<object>(res));
    }

    // PUT /api/v1/cls/update
    [HttpPut("update")]
    public async Task<ActionResult<ApiResponseDto<object>>> UpdateNhanBenhCLS([FromBody] UpdateNhanBenhCLSRequest req)
    {
        var res = System.Linq.Enumerable.ToList(await _svc.UpdateBnCheckInCLSAsync(req));
        if (res.Count > 0)
            await _socket.SendAsync("NHAN_BN", req.HangDoiId, null);
        return Ok(new ApiResponseDto<object>(res));
    }

    // DELETE /api/v1/cls/{hangDoiPhongBanId}?hangDoiId=
    [HttpDelete("{hangDoiPhongBanId}")]
    public async Task<ActionResult<ApiResponseDto<object>>> DeleteNhanBenhCLS(int hangDoiPhongBanId, [FromQuery] int hangDoiId)
    {
        var res = System.Linq.Enumerable.ToList(await _svc.DeleteBnCheckInAsync(hangDoiPhongBanId));
        if (res.Count > 0)
            await _socket.SendAsync("XOA_BN", hangDoiId, null);
        return Ok(new ApiResponseDto<object>(res));
    }
}
