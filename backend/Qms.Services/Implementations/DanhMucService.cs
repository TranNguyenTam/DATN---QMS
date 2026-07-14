using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class DanhMucService : IDanhMucService
{
    private readonly IDatabaseHelper _db;

    public DanhMucService(IDatabaseHelper db)
    {
        _db = db;
    }

    public Task<IEnumerable<dynamic>> SelectDanhMucPhongBanAsync()
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='SelectDanhMucPhongBan'");
    }

    public Task<IEnumerable<dynamic>> CBBLoaiPhongBanAsync()
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='CBBLoaiPhongBan'");
    }

    public Task<IEnumerable<dynamic>> SelectDanhMucPhongBanTheoIDAsync(int phongBanId)
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='SelectDanhMucPhongBanTheoID', @Idx=@Idx", new { Idx = phongBanId });
    }

    public Task<IEnumerable<dynamic>> InsertDanhMucPhongBanAsync(int userId, UpdatePhongBanReq req)
    {
        string ngayGio = DateTime.Now.ToString("yyyyMMdd HH:mm:ss");
        string sql = @"
        EXEC SP_003_DanhMuc
            @Action = 'InsertDanhMucPhongBan',
            @TenPhongBan = @TenPhongBan,
            @TenPhongBanDayDu = @TenPhongBanDayDu,
            @STTPhongBan = @STTPhongBan,
            @LoaiPhongBan = @LoaiPhongBan,
            @TamNgung = @TamNgung,
            @Huy = 0,
            @NgayTao = @NgayTao,
            @NguoiTao = @NguoiTao,
            @NguoiCapNhat = @NguoiCapNhat,
            @MoTa = @MoTa";

        return _db.ListAsync(sql, new
        {
            TenPhongBan = req.TenPhongBan,
            TenPhongBanDayDu = req.TenPhongBanDayDu,
            STTPhongBan = req.SttPhongBan,
            LoaiPhongBan = req.LoaiPhongBan,
            TamNgung = req.TamNgung,
            NgayTao = ngayGio,
            NguoiTao = userId,
            NguoiCapNhat = userId,
            MoTa = req.MoTa
        });
    }

    public Task<IEnumerable<dynamic>> UpdateDanhMucPhongBanAsync(int userId, UpdatePhongBanReq req)
    {
        string ngayGio = DateTime.Now.ToString("yyyyMMdd HH:mm:ss");
        string sql = @"
        EXEC SP_003_DanhMuc
            @Action = 'UpdateDanhMucPhongBan',
            @TenPhongBan = @TenPhongBan,
            @TenPhongBanDayDu = @TenPhongBanDayDu,
            @STTPhongBan = @STTPhongBan,
            @LoaiPhongBan = @LoaiPhongBan,
            @TamNgung = @TamNgung,
            @Huy = 0,
            @NgayCapNhat = @NgayCapNhat,
            @NguoiCapNhat = @NguoiCapNhat,
            @MoTa = @MoTa,
            @Idx = @Idx";

        return _db.ListAsync(sql, new
        {
            TenPhongBan = req.TenPhongBan,
            TenPhongBanDayDu = req.TenPhongBanDayDu,
            STTPhongBan = req.SttPhongBan,
            LoaiPhongBan = req.LoaiPhongBan,
            TamNgung = req.TamNgung,
            NgayCapNhat = ngayGio,
            NguoiCapNhat = userId,
            MoTa = req.MoTa,
            Idx = req.PhongBanId
        });
    }

    public Task<IEnumerable<dynamic>> DeleteDanhMucPhongBanAsync(int userId, int id)
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='DeleteDanhMucPhongBan', @Idx=@Idx, @NguoiCapNhat=@NguoiCapNhat", new { Idx = id, NguoiCapNhat = userId });
    }

    public Task<IEnumerable<dynamic>> SelectDanhMucHangDoiAsync()
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='SelectDanhMucHangDoi'");
    }

    public Task<IEnumerable<dynamic>> SelectDanhMucHangDoiTheoIDAsync(int hangDoiId)
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='SelectDanhMucHangDoiTheoID', @Idx=@Idx", new { Idx = hangDoiId });
    }

    public Task<IEnumerable<dynamic>> InsertDanhMucHangDoiAsync(int userId, UpdateHangDoiReq req)
    {
        string ngayGio = DateTime.Now.ToString("yyyyMMdd HH:mm:ss");
        string sql = @"
        EXEC SP_003_DanhMuc
            @Action = 'InsertDanhMucHangDoi',
            @MaHangDoi = @MaHangDoi,
            @TenHangDoi = @TenHangDoi,
            @KyTuSTT = @KyTuSTT,
            @TamNgung = @TamNgung,
            @Huy = 0,
            @NguoiTao = @NguoiTao,
            @NgayTao = @NgayTao";

        return _db.ListAsync(sql, new
        {
            MaHangDoi = req.MaHangDoi,
            TenHangDoi = req.TenHangDoi,
            KyTuSTT = req.KyTuSTT,
            TamNgung = req.TamNgung,
            NguoiTao = userId,
            NgayTao = ngayGio
        });
    }

    public Task<IEnumerable<dynamic>> UpdateDanhMucHangDoiAsync(int userId, UpdateHangDoiReq req)
    {
        string ngayGio = DateTime.Now.ToString("yyyyMMdd HH:mm:ss");
        string sql = @"
        EXEC SP_003_DanhMuc
            @Action = 'UpdateDanhMucHangDoi',
            @MaHangDoi = @MaHangDoi,
            @TenHangDoi = @TenHangDoi,
            @KyTuSTT = @KyTuSTT,
            @TamNgung = @TamNgung,
            @Huy = 0,
            @NguoiCapNhat = @NguoiCapNhat,
            @NgayCapNhat = @NgayCapNhat,
            @Idx = @Idx";

        return _db.ListAsync(sql, new
        {
            MaHangDoi = req.MaHangDoi,
            TenHangDoi = req.TenHangDoi,
            KyTuSTT = req.KyTuSTT,
            TamNgung = req.TamNgung,
            NguoiCapNhat = userId,
            NgayCapNhat = ngayGio,
            Idx = req.HangDoiId
        });
    }

    public Task<IEnumerable<dynamic>> DeleteDanhMucHangDoiAsync(int userId, int id)
    {
        return _db.ListAsync("EXEC SP_003_DanhMuc @Action='DeleteDanhMucHangDoi', @Idx=@Idx, @NguoiCapNhat=@NguoiCapNhat", new { Idx = id, NguoiCapNhat = userId });
    }
}
