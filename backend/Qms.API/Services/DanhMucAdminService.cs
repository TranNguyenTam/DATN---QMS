using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

public class DanhMucAdminService : IDanhMucAdminService
{
    private readonly IDatabaseHelper _db;
    private readonly ILogger<DanhMucAdminService> _log;

    public DanhMucAdminService(IDatabaseHelper db, ILogger<DanhMucAdminService> log)
    {
        _db = db;
        _log = log;
    }

    // ── Nội dung đặc biệt ────────────────────────────────────────────────

    public Task<IEnumerable<dynamic>> NoiDungListAsync()
        => _db.ListAsync("EXEC SP_003_DanhMuc @Action = N'SelectNoiDungDacBiet'");

    public Task<IEnumerable<dynamic>> HangDoiPhongBanOptionsAsync()
        => _db.ListAsync("EXEC SP_003_DanhMuc @Action = N'CBBHangDoiPhongBan'");

    public Task<IEnumerable<dynamic>> HangDoiOptionsAsync()
        => _db.ListAsync("EXEC SP_003_DanhMuc @Action = N'CBBHangDoi'");

    public async Task<(bool ok, string message)> NoiDungCreateAsync(NoiDungDacBietUpsertRequest req, int opId)
    {
        if (string.IsNullOrWhiteSpace(req.TenNoiDung)) return (false, "Thiếu tên nội dung");

        const string sql = @"
EXEC SP_003_DanhMuc
    @Action       = N'InsertNoiDungDacBiet',
    @TenNoiDung   = @TenNoiDung,
    @Loai         = @Loai,
    @PhongBan_Id  = @PhongBanId,
    @HangDoi_Id   = @HangDoiId,
    @TamNgung     = @TamNgung,
    @Huy          = 0,
    @NgayTao      = NULL,
    @NguoiTao     = @OpId,
    @NgayCapNhat  = NULL,
    @NguoiCapNhat = @OpId,
    @IdLienQuan   = @IdLienQuan";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                req.TenNoiDung,
                Loai = req.Loai ?? "",
                PhongBanId = req.PhongBanId ?? 0,
                HangDoiId = req.HangDoiId ?? 0,
                TamNgung = req.TamNgung ? 1 : 0,
                IdLienQuan = req.IdLienQuan ?? 0,
                OpId = opId,
            });
            return (true, "Thêm nội dung thành công");
        }
        catch (Exception ex) { _log.LogError(ex, "InsertNoiDungDacBiet"); return (false, ex.Message); }
    }

    public async Task<(bool ok, string message)> NoiDungUpdateAsync(int id, NoiDungDacBietUpsertRequest req, int opId)
    {
        if (id <= 0) return (false, "Thiếu id");
        if (string.IsNullOrWhiteSpace(req.TenNoiDung)) return (false, "Thiếu tên nội dung");

        const string sql = @"
EXEC SP_003_DanhMuc
    @Action       = N'UpdateNoiDungDacBiet',
    @TenNoiDung   = @TenNoiDung,
    @Loai         = @Loai,
    @PhongBan_Id  = @PhongBanId,
    @HangDoi_Id   = @HangDoiId,
    @TamNgung     = @TamNgung,
    @Huy          = 0,
    @NgayTao      = NULL,
    @NguoiTao     = @OpId,
    @NgayCapNhat  = NULL,
    @NguoiCapNhat = @OpId,
    @IdLienQuan   = @IdLienQuan,
    @Idx          = @Id";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                Id = id,
                req.TenNoiDung,
                Loai = req.Loai ?? "",
                PhongBanId = req.PhongBanId ?? 0,
                HangDoiId = req.HangDoiId ?? 0,
                TamNgung = req.TamNgung ? 1 : 0,
                IdLienQuan = req.IdLienQuan ?? 0,
                OpId = opId,
            });
            return (true, "Cập nhật nội dung thành công");
        }
        catch (Exception ex) { _log.LogError(ex, "UpdateNoiDungDacBiet"); return (false, ex.Message); }
    }

    public async Task<(bool ok, string message)> NoiDungDeleteAsync(int id, int opId)
    {
        if (id <= 0) return (false, "Thiếu id");
        try
        {
            await _db.ExecuteAsync(
                "EXEC SP_003_DanhMuc @Action = N'DeleteNoiDungDacBiet', @Idx = @Id, @NguoiCapNhat = @OpId",
                new { Id = id, OpId = opId });
            return (true, "Đã xóa nội dung");
        }
        catch (Exception ex) { _log.LogError(ex, "DeleteNoiDungDacBiet"); return (false, ex.Message); }
    }

    // ── Thời gian thực hiện DV ───────────────────────────────────────────

    public Task<IEnumerable<dynamic>> ThoiGianListAsync()
        => _db.ListAsync("EXEC SP_003_DanhMuc @Action = N'SelectThoiGianThucHien'");

    public Task<IEnumerable<dynamic>> DichVuOptionsAsync()
        => _db.ListAsync("EXEC SP_003_DanhMuc @Action = N'CBBDichVu'");

    public async Task<(bool ok, string message)> ThoiGianCreateAsync(ThoiGianDichVuUpsertRequest req, int opId)
    {
        if (req.SoPhut <= 0) return (false, "Số phút phải lớn hơn 0");
        if (req.DichVuId <= 0) return (false, "Chưa chọn dịch vụ");

        const string sql = @"
EXEC SP_003_DanhMuc
    @Action       = N'InsertThoiGianThucHien',
    @SoPhut       = @SoPhut,
    @DichVu_Id    = @DichVuId,
    @TamNgung     = @TamNgung,
    @Huy          = 0,
    @NgayTao      = NULL,
    @NguoiTao     = @OpId,
    @NgayCapNhat  = NULL,
    @NguoiCapNhat = @OpId";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                req.SoPhut,
                req.DichVuId,
                TamNgung = req.TamNgung ? 1 : 0,
                OpId = opId,
            });
            return (true, "Thêm thời gian dịch vụ thành công");
        }
        catch (Exception ex) { _log.LogError(ex, "InsertThoiGianThucHien"); return (false, ex.Message); }
    }

    public async Task<(bool ok, string message)> ThoiGianUpdateAsync(int id, ThoiGianDichVuUpsertRequest req, int opId)
    {
        if (id <= 0) return (false, "Thiếu id");
        if (req.SoPhut <= 0) return (false, "Số phút phải lớn hơn 0");

        const string sql = @"
EXEC SP_003_DanhMuc
    @Action       = N'UpdateThoiGianThucHien',
    @SoPhut       = @SoPhut,
    @DichVu_Id    = @DichVuId,
    @TamNgung     = @TamNgung,
    @Huy          = 0,
    @NgayTao      = NULL,
    @NguoiTao     = @OpId,
    @NgayCapNhat  = NULL,
    @NguoiCapNhat = @OpId,
    @Idx          = @Id";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                Id = id,
                req.SoPhut,
                req.DichVuId,
                TamNgung = req.TamNgung ? 1 : 0,
                OpId = opId,
            });
            return (true, "Cập nhật thời gian dịch vụ thành công");
        }
        catch (Exception ex) { _log.LogError(ex, "UpdateThoiGianThucHien"); return (false, ex.Message); }
    }

    public async Task<(bool ok, string message)> ThoiGianDeleteAsync(int id, int opId)
    {
        if (id <= 0) return (false, "Thiếu id");
        try
        {
            await _db.ExecuteAsync(
                "EXEC SP_003_DanhMuc @Action = N'DeleteThoiGianThucHien', @Idx = @Id, @NguoiCapNhat = @OpId",
                new { Id = id, OpId = opId });
            return (true, "Đã xóa thời gian dịch vụ");
        }
        catch (Exception ex) { _log.LogError(ex, "DeleteThoiGianThucHien"); return (false, ex.Message); }
    }

    // ── Phân quyền User - Phòng ban - Hàng đợi ───────────────────────────

    public Task<IEnumerable<dynamic>> UserOptionsAsync()
        => _db.ListAsync("EXEC SP_003_DanhMuc @Action = N'CBBUsers'");

    public Task<IEnumerable<dynamic>> GetPhongBanOfUserAsync(int userId)
        => _db.ListAsync(
            "EXEC SP_003_DanhMuc @Action = N'SelectPhongBanTheoIdUser', @User_Id = @UserId",
            new { UserId = userId });

    public Task<IEnumerable<dynamic>> GetHangDoiOfUserAsync(int userId)
        => _db.ListAsync(
            "EXEC SP_003_DanhMuc @Action = N'SelectHangDoiTheoIdUser', @User_Id = @UserId",
            new { UserId = userId });

    public async Task<(bool ok, string message)> SaveUserPhongBanHangDoiAsync(PermissionUserPbHdSaveRequest req, int opId)
    {
        if (req.UserId <= 0) return (false, "Chưa chọn người dùng");

        try
        {
            // Xóa quyền cũ (hàng đợi + phòng ban) rồi insert lại — giống flow WinForms.
            await _db.ExecuteAsync(
                "EXEC SP_003_DanhMuc @Action = N'DelelePhanQuyenHangDoiTheoIdUser', @User_Id = @UserId",
                new { UserId = req.UserId });
            await _db.ExecuteAsync(
                "EXEC SP_003_DanhMuc @Action = N'DeletePhanQuyenPhongBan', @Idx = @UserId",
                new { UserId = req.UserId });

            foreach (var pbId in req.PhongBanIds.Distinct())
            {
                if (pbId <= 0) continue;
                await _db.ExecuteAsync(
                    "EXEC SP_003_DanhMuc @Action = N'InsertPhanQuyenIdUserPhongBan', @User_Id = @UserId, @PhongBan_Id = @PbId",
                    new { UserId = req.UserId, PbId = pbId });
            }
            foreach (var hdId in req.HangDoiIds.Distinct())
            {
                if (hdId <= 0) continue;
                await _db.ExecuteAsync(
                    "EXEC SP_003_DanhMuc @Action = N'InsertPhanQuyenIdUserHangDoi', @User_Id = @UserId, @HangDoi_Id = @HdId",
                    new { UserId = req.UserId, HdId = hdId });
            }
            return (true, "Đã lưu phân quyền");
        }
        catch (Exception ex) { _log.LogError(ex, "SaveUserPhongBanHangDoi"); return (false, ex.Message); }
    }
}
