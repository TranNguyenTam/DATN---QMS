using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class HangDoiTiepNhanService : IHangDoiTiepNhanService
{
    private readonly IDatabaseHelper _db;

    public HangDoiTiepNhanService(IDatabaseHelper db)
    {
        _db = db;
    }

    // SP_004_HangDoiTiepNhan

    public Task<IEnumerable<dynamic>> CBBQuayAsync(int userId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'comboboxtiepnhan', @id = @Id", new { Id = userId });

    public Task<IEnumerable<dynamic>> CBBHangDoiAsync(int userId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'comboboxtndoituong', @id = @Id", new { Id = userId });

    public Task<IEnumerable<dynamic>> HangDoi_detail_selectAsync(int hangDoiId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'HangDoi_detail_select', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> Select_MoiBNAsync(int hangDoiId, int quayId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'Select_MoiBN', @HangDoi_Id = @HangDoiId, @ID_Quay = @QuayId", new { HangDoiId = hangDoiId, QuayId = quayId });

    public Task<IEnumerable<dynamic>> Select_MoiBN_TenBenhNhanAsync(int hangDoiId, string stt)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'Select_MoiBN_TenBenhNhan', @HangDoi_Id = @HangDoiId, @SoThuTuDayDu = @STT", new { HangDoiId = hangDoiId, STT = stt });

    public Task<IEnumerable<dynamic>> BaoCaoTongSoBNChuaTNAsync(int userId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'BaoCaoTongSoBNChuaTN', @User_Id = @UserId", new { UserId = userId });

    public Task<IEnumerable<dynamic>> update_MoiBNAsync(GoiTiepTheoRequest req)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'update_MoiBN', @HangDoi_Id = @HangDoiId, @ID_Quay = @QuayId",
            new { HangDoiId = req.HangDoiId, QuayId = req.PhongBanId });

    public Task<IEnumerable<dynamic>> GetHangDoiHienThiTVTiepNhanAsync(int phongBanId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'HangDoi_HienThiTVTiepNhan', @PhongBan_Id = @PhongBanId", new { PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> GetHangDoiHienThiTVTiepNhanNoRowAsync(int phongBanId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'HangDoi_HienThiTVTiepNhanNoRow', @PhongBan_Id = @PhongBanId", new { PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> GetHangDoiTiepNhanDangChoAsync(int hangDoiId)
        => _db.ListAsync("exec SP_004_HangDoiTiepNhan @Action = N'HangDoiTiepNhanDangCho', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    // SP_K_002_HangDoiTiepNhan

    public Task<IEnumerable<dynamic>> SelectDichVuKhamBenhAsync()
        => _db.ListAsync("exec SP_K_002_HangDoiTiepNhan @Action = N'SelectDichVuKhamBenh'");

    public Task<IEnumerable<dynamic>> CheckSoVaoVienVPAsync(string soVaoVien)
        => _db.ListAsync("exec SP_K_002_HangDoiTiepNhan @Action = N'CheckSoVaoVienVP', @soVaoVien = @SoVaoVien", new { SoVaoVien = soVaoVien });

    public async Task<dynamic?> NoiDungGioiThieuAsync()
    {
        var rows = await _db.ListAsync("exec SP_K_002_HangDoiTiepNhan @Action = N'NoiDungGioiThieu'");
        return rows is System.Collections.IEnumerable e
            ? (dynamic?)System.Linq.Enumerable.FirstOrDefault(e.Cast<dynamic>())
            : null;
    }
}
