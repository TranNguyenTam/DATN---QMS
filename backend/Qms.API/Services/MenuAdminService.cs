using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

public class MenuAdminService : IMenuAdminService
{
    private readonly IDatabaseHelper _db;
    private readonly ILogger<MenuAdminService> _log;

    public MenuAdminService(IDatabaseHelper db, ILogger<MenuAdminService> log)
    {
        _db = db;
        _log = log;
    }

    public Task<IEnumerable<dynamic>> ListAsync()
        => _db.ListAsync("EXEC SP_001_Users @Action = N'SelectMenu'");

    public Task<IEnumerable<dynamic>> ParentOptionsAsync()
        => _db.ListAsync("EXEC SP_001_Users @Action = N'CBBMenu'");

    public async Task<(bool ok, string message)> CreateAsync(MenuUpsertRequest req, int opId)
    {
        if (string.IsNullOrWhiteSpace(req.MenuCode)) return (false, "Thiếu mã menu");
        if (string.IsNullOrWhiteSpace(req.MenuName)) return (false, "Thiếu tên menu");

        const string sql = @"
EXEC SP_001_Users
    @Action = N'InsertMenu',
    @MenuCode   = @MenuCode,
    @MenuName   = @MenuName,
    @ParentMenu = @ParentMenu,
    @TamNgung   = @TamNgung,
    @NgayTao    = NULL,
    @NguoiTao   = @OpId,
    @NgayCapNhat = NULL,
    @NguoiCapNhat = @OpId,
    @Huy        = 0";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                req.MenuCode,
                req.MenuName,
                ParentMenu = req.ParentMenu ?? 0,
                TamNgung = req.TamNgung ? 1 : 0,
                OpId = opId,
            });
            return (true, "Thêm menu thành công");
        }
        catch (Exception ex) { _log.LogError(ex, "InsertMenu"); return (false, ex.Message); }
    }

    public async Task<(bool ok, string message)> UpdateAsync(int id, MenuUpsertRequest req, int opId)
    {
        if (id <= 0) return (false, "Thiếu id");
        if (string.IsNullOrWhiteSpace(req.MenuCode)) return (false, "Thiếu mã menu");
        if (string.IsNullOrWhiteSpace(req.MenuName)) return (false, "Thiếu tên menu");

        const string sql = @"
EXEC SP_001_Users
    @Action     = N'UpdateMenu',
    @MenuCode   = @MenuCode,
    @MenuName   = @MenuName,
    @ParentMenu = @ParentMenu,
    @TamNgung   = @TamNgung,
    @NgayTao    = NULL,
    @NguoiTao   = @OpId,
    @NgayCapNhat = NULL,
    @NguoiCapNhat = @OpId,
    @Huy        = 0,
    @Idx        = @Id";
        try
        {
            await _db.ExecuteAsync(sql, new
            {
                Id = id,
                req.MenuCode,
                req.MenuName,
                ParentMenu = req.ParentMenu ?? 0,
                TamNgung = req.TamNgung ? 1 : 0,
                OpId = opId,
            });
            return (true, "Cập nhật menu thành công");
        }
        catch (Exception ex) { _log.LogError(ex, "UpdateMenu"); return (false, ex.Message); }
    }

    public async Task<(bool ok, string message)> DeleteAsync(int id, int opId)
    {
        if (id <= 0) return (false, "Thiếu id");
        try
        {
            await _db.ExecuteAsync(
                "EXEC SP_001_Users @Action = N'DeleteMenu', @Idx = @Id, @NguoiCapNhat = @OpId",
                new { Id = id, OpId = opId });
            return (true, "Đã xóa menu");
        }
        catch (Exception ex) { _log.LogError(ex, "DeleteMenu"); return (false, ex.Message); }
    }
}
