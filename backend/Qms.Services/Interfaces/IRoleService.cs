namespace Qms.Services.Interfaces;

public interface IRoleService
{
    // ── Query (login flow) ───────────────────────────────────────
    Task<IEnumerable<string>> GetRoleCodesOfUserAsync(int userId);
    Task<IEnumerable<string>> GetPermissionsOfUserAsync(int userId);

    // ── Admin CRUD ───────────────────────────────────────────────
    Task<IEnumerable<dynamic>> ListRolesAsync();
    Task<IEnumerable<dynamic>> ListUsersWithRolesAsync();
    Task<IEnumerable<string>> GetPermissionsOfRoleAsync(int roleId);

    Task<int> CreateRoleAsync(string code, string name, string? desc);
    Task<bool> UpdateRoleAsync(int roleId, string name, string? desc, bool? tamNgung);
    Task<bool> DeleteRoleAsync(int roleId);

    Task<bool> AssignUserRoleAsync(int userId, int roleId);
    Task<bool> RemoveUserRoleAsync(int userId, int roleId);

    Task<bool> SetRolePermissionsAsync(int roleId, IEnumerable<string> permissionKeys);
}
