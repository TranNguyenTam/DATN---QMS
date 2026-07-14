using Qms.Core.DTOs;
using Qms.Core.Exceptions;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class AuthService : IAuthService
{
    private readonly IDatabaseHelper _db;
    private readonly CryptUtil _crypt;
    private readonly JwtUtil _jwt;
    private readonly IRoleService _roleSvc;

    public AuthService(IDatabaseHelper db, CryptUtil crypt, JwtUtil jwt, IRoleService roleSvc)
    {
        _db = db;
        _crypt = crypt;
        _jwt = jwt;
        _roleSvc = roleSvc;
    }

    // ─── Login ───────────────────────────────────────────────────────────────────

    public async Task<AuthRes> LoginAsync(string username, string password)
    {
        var user = await GetUserByUserCodeAsync(username);
        if (user == null)
            throw new AppException(ErrorCode.UNAUTHORIZED, "Sai tài khoản hoặc mật khẩu");

        if (!_crypt.VerifyPassword(password, user.Password))
            throw new AppException(ErrorCode.UNAUTHORIZED, "Sai tài khoản hoặc mật khẩu");

        // Nâng cấp dần: mật khẩu cũ (mã hóa XOR) được băm lại bằng bcrypt ngay khi
        // đăng nhập thành công. Không chặn login nếu việc ghi lại gặp lỗi.
        if (_crypt.NeedsRehash(user.Password))
        {
            try
            {
                await _db.ExecuteAsync(
                    "EXEC SP_001_Users @Action = N'ChangePassword', @User_Id = @UserId, @Password = @Password",
                    new { UserId = user.UserId, Password = _crypt.HashPassword(password) });
            }
            catch { /* bỏ qua: không ảnh hưởng đăng nhập */ }
        }

        var roles = (await _roleSvc.GetRoleCodesOfUserAsync(user.UserId)).ToList();
        var perms = (await _roleSvc.GetPermissionsOfUserAsync(user.UserId)).ToList();
        var token = _jwt.GenerateToken(username, user.UserId, roles, perms);
        var refreshToken = await AddRefreshTokenAsync(user.UserId);

        return await MapToAuthResAsync(user, token, refreshToken);
    }

    // ─── Load session ────────────────────────────────────────────────────────────

    public async Task<AuthRes> LoadSessionAsync(string userCode)
    {
        var user = await GetUserByUserCodeAsync(userCode);
        if (user == null)
            throw new AppException(ErrorCode.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ");

        return await MapToAuthResAsync(user, null, null);
    }

    // ─── Refresh token ────────────────────────────────────────────────────────────

    public async Task<AuthRes> RefreshTokenAsync(string refreshToken)
    {
        var user = await GetUserByRefreshTokenAsync(refreshToken);
        if (user == null)
            throw new AppException(ErrorCode.UNAUTHORIZED, "Refresh token không hợp lệ hoặc đã hết hạn");

        await DeleteRefreshTokenAsync(refreshToken);
        var roles = (await _roleSvc.GetRoleCodesOfUserAsync(user.UserId)).ToList();
        var perms = (await _roleSvc.GetPermissionsOfUserAsync(user.UserId)).ToList();
        var newToken = _jwt.GenerateToken(user.UserCode, user.UserId, roles, perms);
        var newRefresh = _jwt.GenerateRefreshTokenRaw();

        await InsertRefreshTokenAsync(user.UserId, newRefresh);

        return await MapToAuthResAsync(user, newToken, newRefresh);
    }

    public async Task<(bool ok, string message)> ChangePasswordAsync(int userId, string oldPassword, string newPassword)
    {
        if (userId <= 0) return (false, "Phiên đăng nhập không hợp lệ");
        if (string.IsNullOrWhiteSpace(oldPassword)) return (false, "Vui lòng nhập mật khẩu hiện tại");
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 4)
            return (false, "Mật khẩu mới tối thiểu 4 ký tự");
        if (oldPassword == newPassword) return (false, "Mật khẩu mới phải khác mật khẩu cũ");

        // Gọi SP_001_Users Action=CheckChangePassword để lấy Password hiện tại (đã mã hóa)
        const string checkSql = "EXEC SP_001_Users @Action = N'CheckChangePassword', @User_Id = @UserId";
        var row = await _db.OneAsync(checkSql, new { UserId = userId });
        if (row is null) return (false, "Không tìm thấy người dùng");
        var d = (IDictionary<string, object>)row;
        if (!d.TryGetValue("Password", out var pwObj) || pwObj is null)
            return (false, "Tài khoản chưa có mật khẩu");

        if (!_crypt.VerifyPassword(oldPassword, pwObj.ToString() ?? ""))
            return (false, "Mật khẩu hiện tại không đúng");

        var hashedNew = _crypt.HashPassword(newPassword);
        const string updateSql = "EXEC SP_001_Users @Action = N'ChangePassword', @User_Id = @UserId, @Password = @Password";
        await _db.ExecuteAsync(updateSql, new { UserId = userId, Password = hashedNew });
        return (true, "Đổi mật khẩu thành công");
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private async Task<UserRaw?> GetUserByUserCodeAsync(string userCode)
    {
        const string sql = """
            SELECT TOP 1
                t.UserCode, t.Password, t.User_Id, t.UserName,
                t.TenTivi, t.TenAmThanh
            FROM Sys_Users t
            WHERE t.UserCode = @UserCode
              AND t.tamNgung = 0
              AND t.huy = 0
            """;

        var rows = await _db.ListAsync(sql, new { UserCode = userCode });
        var first = rows.FirstOrDefault();
        if (first == null) return null;

        var d = (IDictionary<string, object>)first;
        return new UserRaw
        {
            UserId    = d.TryGetValue("User_Id",    out var uid) ? Convert.ToInt32(uid) : 0,
            UserCode  = d.TryGetValue("UserCode",   out var uc)  ? uc?.ToString() ?? "" : "",
            UserName  = d.TryGetValue("UserName",   out var un)  ? un?.ToString() ?? "" : "",
            Password  = d.TryGetValue("Password",   out var pw)  ? pw?.ToString() ?? "" : "",
            TenTivi   = d.TryGetValue("TenTivi",    out var tv)  ? tv?.ToString() ?? "" : "",
            TenAmThanh = d.TryGetValue("TenAmThanh", out var at) ? at?.ToString() ?? "" : "",
        };
    }

    private async Task<UserRaw?> GetUserByRefreshTokenAsync(string refreshToken)
    {
        const string sql = """
            SELECT TOP 1
                t.UserCode, t.User_Id, t.UserName,
                t.TenTivi, t.TenAmThanh, '' AS Password
            FROM RefreshToken r
            LEFT JOIN Sys_Users t ON r.user_id = t.User_Id
            WHERE r.token = @Token
              AND r.is_revoked = 0
              AND r.expires_at > GETDATE()
              AND t.tamNgung = 0
              AND t.huy = 0
            """;

        var rows = await _db.ListAsync(sql, new { Token = refreshToken });
        var first = rows.FirstOrDefault();
        if (first == null) return null;

        var d = (IDictionary<string, object>)first;
        return new UserRaw
        {
            UserId   = d.TryGetValue("User_Id",  out var uid) ? Convert.ToInt32(uid) : 0,
            UserCode = d.TryGetValue("UserCode", out var uc)  ? uc?.ToString() ?? "" : "",
            UserName = d.TryGetValue("UserName", out var un)  ? un?.ToString() ?? "" : "",
            TenTivi  = d.TryGetValue("TenTivi",  out var tv)  ? tv?.ToString() ?? "" : "",
            TenAmThanh = d.TryGetValue("TenAmThanh", out var at) ? at?.ToString() ?? "" : "",
        };
    }

    private async Task<List<string>> GetPermissionsAsync(int userId)
    {
        const string sql = "EXEC SP_001_Users @Action = 'CheckUserPermission', @User_Id = @UserId";
        var rows = await _db.ListAsync(sql, new { UserId = userId });
        return rows
            .Select(r => (IDictionary<string, object>)r)
            .Where(d => d.ContainsKey("MenuCode"))
            .Select(d => d["MenuCode"]?.ToString() ?? "")
            .ToList();
    }

    private async Task<string> AddRefreshTokenAsync(int userId)
    {
        // Xóa token cũ nhất nếu đã có >= 2
        const string selectSql = "SELECT TOP 2 id FROM RefreshToken WHERE user_id = @UserId ORDER BY id ASC";
        var existing = await _db.ListAsync(selectSql, new { UserId = userId });
        if (existing.Count() >= 2)
        {
            var oldest = (IDictionary<string, object>)existing.First();
            int oldId = Convert.ToInt32(oldest["id"]);
            await _db.ListAsync("DELETE FROM RefreshToken WHERE id = @Id", new { Id = oldId });
        }

        var newToken = _jwt.GenerateRefreshTokenRaw();
        await InsertRefreshTokenAsync(userId, newToken);
        return newToken;
    }

    private Task InsertRefreshTokenAsync(int userId, string token)
    {
        const string sql = """
            INSERT INTO RefreshToken (user_id, token, expires_at, created_at, is_revoked)
            VALUES (@UserId, @Token, DATEADD(SECOND, 2592000, GETDATE()), GETDATE(), 0)
            """;
        return _db.ListAsync(sql, new { UserId = userId, Token = token });
    }

    private Task DeleteRefreshTokenAsync(string token)
    {
        return _db.ListAsync("DELETE FROM RefreshToken WHERE token = @Token", new { Token = token });
    }

    private async Task<AuthRes> MapToAuthResAsync(UserRaw user, string? token, string? refreshToken)
    {
        // Hợp nhất permissions từ 2 nguồn:
        //   - SP_001 'CheckUserPermission' (legacy, gán trực tiếp user→menu)
        //   - Sys_Role_Permissions qua Sys_User_Roles (RBAC mới)
        var legacyPerms = await GetPermissionsAsync(user.UserId);
        var rolePerms = await _roleSvc.GetPermissionsOfUserAsync(user.UserId);
        var allPerms = legacyPerms.Union(rolePerms).Distinct().ToList();
        var roles = (await _roleSvc.GetRoleCodesOfUserAsync(user.UserId)).ToList();

        return new AuthRes
        {
            UserId      = user.UserId,
            UserCode    = user.UserCode,
            UserName    = user.UserName,
            Tivi        = user.UserCode == user.TenTivi,
            AmThanh     = user.UserCode == user.TenAmThanh,
            Permissions = allPerms,
            Roles       = roles,
            Token       = token,
            RefreshToken = refreshToken
        };
    }

    // ─── Private model ────────────────────────────────────────────────────────────
    private class UserRaw
    {
        public int UserId { get; set; }
        public string UserCode { get; set; } = "";
        public string UserName { get; set; } = "";
        public string Password { get; set; } = "";
        public string TenTivi { get; set; } = "";
        public string TenAmThanh { get; set; } = "";
    }
}
