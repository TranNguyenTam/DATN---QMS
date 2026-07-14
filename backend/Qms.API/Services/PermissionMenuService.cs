using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

public class PermissionMenuService : IPermissionMenuService
{
    private readonly IDatabaseHelper _db;
    private readonly ILogger<PermissionMenuService> _log;

    public PermissionMenuService(IDatabaseHelper db, ILogger<PermissionMenuService> log)
    {
        _db = db;
        _log = log;
    }

    public Task<IEnumerable<dynamic>> UsersAsync()
        => _db.ListAsync("EXEC SP_001_Users @Action = N'SelectUserPermission'");

    public Task<IEnumerable<dynamic>> MenusAsync()
        => _db.ListAsync("EXEC SP_001_Users @Action = N'SelectMenuPermission'");

    public Task<IEnumerable<dynamic>> UserMenusAsync(int userId)
        => _db.ListAsync(
            "EXEC SP_001_Users @Action = N'SelectMenuPermissionUserId', @Idx = @UserId",
            new { UserId = userId });

    public async Task<(bool ok, string message)> SaveAsync(PermissionMenuSaveRequest req)
    {
        if (req.UserId <= 0) return (false, "Chưa chọn người dùng");

        try
        {
            await _db.ExecuteAsync(
                "EXEC SP_001_Users @Action = N'DeletePermissionUserId', @Idx = @UserId",
                new { UserId = req.UserId });

            foreach (var menuId in req.MenuIds.Distinct())
            {
                if (menuId <= 0) continue;
                await _db.ExecuteAsync(
                    "EXEC SP_001_Users @Action = N'InsertPermissionUserId', @User_Id = @UserId, @Menu_Id = @MenuId",
                    new { UserId = req.UserId, MenuId = menuId });
            }
            return (true, "Đã lưu phân quyền menu");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "SavePermissionMenu");
            return (false, ex.Message);
        }
    }
}
