using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using System.Security.Claims;

namespace Qms.API.Controllers;

/// <summary>
/// Cầu nối sang eHospital — tương đương màn `HeThong/DanhSachBenhNhan.cs`:
/// xem BN trong eHOS, chọn phòng ban, bấm "Tiếp nhận mới".
/// </summary>
[ApiController]
[Route("api/v1/ehos")]
[Authorize]
public class EHospitalController : ControllerBase
{
    private readonly IDatabaseHelper _db;
    public EHospitalController(IDatabaseHelper db) => _db = db;

    private int OpId()
    {
        foreach (var k in new[] { "userId", "UserId", "user_id", ClaimTypes.NameIdentifier })
            if (int.TryParse(User.FindFirstValue(k), out var id) && id > 0) return id;
        return 0;
    }

    [HttpGet("patients")]
    public async Task<ActionResult<ApiResponseDto<object>>> Patients()
        => Ok(new ApiResponseDto<object>(
            await _db.ListAsync("EXEC SP_001_Users @Action = N'DM_benhNhan_ehos'")));

    [HttpGet("phong-ban")]
    public async Task<ActionResult<ApiResponseDto<object>>> PhongBan()
        => Ok(new ApiResponseDto<object>(
            await _db.ListAsync("EXEC SP_001_Users @Action = N'PhongBanEhos_HangDoi'")));

    [HttpGet("patient/{benhNhanId:int}/chi-dinh")]
    public async Task<ActionResult<ApiResponseDto<object>>> ChiDinh(int benhNhanId)
        => Ok(new ApiResponseDto<object>(await _db.ListAsync(
            "EXEC SP_001_Users @Action = N'selectBenhNhanDaChiDinhCLSTheoBenhNhan_Id', @BenhNhan_Id = @Id",
            new { Id = benhNhanId })));

    public class TiepNhanMoiRequest
    {
        public int BenhNhanId { get; set; }
        public int PhongBanId { get; set; }
    }

    [HttpPost("tiep-nhan-moi")]
    public async Task<ActionResult<ApiResponseDto<object>>> TiepNhanMoi([FromBody] TiepNhanMoiRequest req)
    {
        if (req.BenhNhanId <= 0 || req.PhongBanId <= 0)
            return Ok(new ApiResponseDto<object>(new { ok = false, message = "Thiếu bệnh nhân hoặc phòng ban" }));

        // Kiểm tra phòng ban đã map hàng đợi chưa — giống validation WinForms.
        var check = await _db.ListAsync(
            "EXEC SP_001_Users @Action = N'CheckPhongBanDaMapHangDoi', @Idx = @Id",
            new { Id = req.PhongBanId });
        if (!check.Any())
        {
            return Ok(new ApiResponseDto<object>(new
            {
                ok = false,
                message = "Phòng ban chưa map hàng đợi — cấu hình Danh mục trước"
            }));
        }

        try
        {
            await _db.ExecuteAsync(
                "EXEC sp_CNTT_003_ThemTiepNhanMoi @BenhNhanId, @PhongBanId",
                new { req.BenhNhanId, req.PhongBanId });
            return Ok(new ApiResponseDto<object>(new { ok = true, message = "Đã tiếp nhận mới" }));
        }
        catch (Exception ex)
        {
            return Ok(new ApiResponseDto<object>(new { ok = false, message = ex.Message }));
        }
    }
}
