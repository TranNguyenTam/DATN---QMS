using Qms.Core.DTOs;

namespace Qms.API.Services;

public interface IPermissionMenuService
{
    Task<IEnumerable<dynamic>> UsersAsync();
    Task<IEnumerable<dynamic>> MenusAsync();                 // cây menu để tick
    Task<IEnumerable<dynamic>> UserMenusAsync(int userId);   // menu đã cấp cho user
    Task<(bool ok, string message)> SaveAsync(PermissionMenuSaveRequest req);
}
