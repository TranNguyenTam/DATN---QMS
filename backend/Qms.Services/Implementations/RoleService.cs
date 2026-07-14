using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;

namespace Qms.Services.Implementations;

public class RoleService : IRoleService
{
    private readonly IDatabaseHelper _db;
    public RoleService(IDatabaseHelper db) => _db = db;

    public async Task<IEnumerable<string>> GetRoleCodesOfUserAsync(int userId)
    {
        var rows = await _db.ListAsync(@"
SELECT r.RoleCode
FROM dbo.Sys_User_Roles ur
JOIN dbo.Sys_Roles r ON ur.Role_Id = r.Role_Id
WHERE ur.User_Id = @Id AND ISNULL(r.TamNgung, 0) = 0",
            new { Id = userId });
        return rows.Select(r => (string)((IDictionary<string, object>)r)["RoleCode"]);
    }

    public async Task<IEnumerable<string>> GetPermissionsOfUserAsync(int userId)
    {
        var rows = await _db.ListAsync(@"
SELECT DISTINCT rp.PermissionKey
FROM dbo.Sys_User_Roles ur
JOIN dbo.Sys_Role_Permissions rp ON ur.Role_Id = rp.Role_Id
WHERE ur.User_Id = @Id",
            new { Id = userId });
        return rows.Select(r => (string)((IDictionary<string, object>)r)["PermissionKey"]);
    }

    public Task<IEnumerable<dynamic>> ListRolesAsync()
        => _db.ListAsync(@"
SELECT r.Role_Id, r.RoleCode, r.RoleName, r.Description, r.TamNgung, r.NgayTao,
       SoUser = (SELECT COUNT(*) FROM dbo.Sys_User_Roles WHERE Role_Id = r.Role_Id),
       SoPerm = (SELECT COUNT(*) FROM dbo.Sys_Role_Permissions WHERE Role_Id = r.Role_Id)
FROM dbo.Sys_Roles r ORDER BY r.Role_Id;");

    public Task<IEnumerable<dynamic>> ListUsersWithRolesAsync()
        => _db.ListAsync(@"
SELECT u.User_Id, u.UserCode, u.UserName, u.TamNgung, u.Huy,
       Roles = STUFF((
         SELECT N', ' + r.RoleCode FROM dbo.Sys_User_Roles ur
         JOIN dbo.Sys_Roles r ON ur.Role_Id = r.Role_Id
         WHERE ur.User_Id = u.User_Id
         FOR XML PATH('')), 1, 2, '')
FROM dbo.Sys_Users u
WHERE ISNULL(u.Huy, 0) = 0
ORDER BY u.UserCode;");

    public async Task<IEnumerable<string>> GetPermissionsOfRoleAsync(int roleId)
    {
        var rows = await _db.ListAsync(
            "SELECT PermissionKey FROM dbo.Sys_Role_Permissions WHERE Role_Id = @Id",
            new { Id = roleId });
        return rows.Select(r => (string)((IDictionary<string, object>)r)["PermissionKey"]);
    }

    public Task<int> CreateRoleAsync(string code, string name, string? desc)
        => _db.ScalarAsync<int>(@"
INSERT INTO dbo.Sys_Roles (RoleCode, RoleName, Description, TamNgung, NgayTao)
VALUES (@Code, @Name, @Desc, 0, GETDATE());
SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { Code = code, Name = name, Desc = desc });

    public async Task<bool> UpdateRoleAsync(int roleId, string name, string? desc, bool? tamNgung)
    {
        int rows = await _db.ExecuteAsync(@"
UPDATE dbo.Sys_Roles
SET RoleName = @Name, Description = @Desc,
    TamNgung = COALESCE(@Tn, TamNgung)
WHERE Role_Id = @Id",
            new { Id = roleId, Name = name, Desc = desc, Tn = tamNgung });
        return rows > 0;
    }

    public async Task<bool> DeleteRoleAsync(int roleId)
    {
        // Bảo vệ: không cho xóa ADMIN
        int isAdmin = await _db.ScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.Sys_Roles WHERE Role_Id = @Id AND RoleCode = 'ADMIN'",
            new { Id = roleId });
        if (isAdmin > 0) return false;

        await _db.ExecuteAsync("DELETE FROM dbo.Sys_Role_Permissions WHERE Role_Id = @Id", new { Id = roleId });
        await _db.ExecuteAsync("DELETE FROM dbo.Sys_User_Roles WHERE Role_Id = @Id", new { Id = roleId });
        int rows = await _db.ExecuteAsync("DELETE FROM dbo.Sys_Roles WHERE Role_Id = @Id", new { Id = roleId });
        return rows > 0;
    }

    public async Task<bool> AssignUserRoleAsync(int userId, int roleId)
    {
        int rows = await _db.ExecuteAsync(@"
IF NOT EXISTS (SELECT 1 FROM dbo.Sys_User_Roles WHERE User_Id = @U AND Role_Id = @R)
    INSERT INTO dbo.Sys_User_Roles (User_Id, Role_Id) VALUES (@U, @R);",
            new { U = userId, R = roleId });
        return rows >= 0;
    }

    public async Task<bool> RemoveUserRoleAsync(int userId, int roleId)
    {
        int rows = await _db.ExecuteAsync(
            "DELETE FROM dbo.Sys_User_Roles WHERE User_Id = @U AND Role_Id = @R",
            new { U = userId, R = roleId });
        return rows > 0;
    }

    public async Task<bool> SetRolePermissionsAsync(int roleId, IEnumerable<string> permissionKeys)
    {
        var keys = (permissionKeys ?? Enumerable.Empty<string>()).Distinct().ToList();
        await _db.ExecuteAsync("DELETE FROM dbo.Sys_Role_Permissions WHERE Role_Id = @Id", new { Id = roleId });
        foreach (var k in keys)
        {
            if (string.IsNullOrWhiteSpace(k)) continue;
            await _db.ExecuteAsync(@"
INSERT INTO dbo.Sys_Role_Permissions (Role_Id, PermissionKey) VALUES (@R, @K);",
                new { R = roleId, K = k });
        }
        return true;
    }
}
