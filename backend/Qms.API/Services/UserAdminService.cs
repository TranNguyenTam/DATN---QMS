using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

/// <summary>
/// CRUD người dùng qua SP_001_Users với @Action = Select/Insert/Update/Delete.
/// Chuyển thể từ form WinForms `HeThong/Users.cs` của K_QMS.
/// </summary>
public class UserAdminService : IUserAdminService
{
    private readonly IDatabaseHelper _db;
    private readonly CryptUtil _crypt;
    private readonly ILogger<UserAdminService> _log;

    public UserAdminService(IDatabaseHelper db, CryptUtil crypt, ILogger<UserAdminService> log)
    {
        _db = db;
        _crypt = crypt;
        _log = log;
    }

    public async Task<IEnumerable<dynamic>> ListAsync()
    {
        var rows = await _db.ListAsync("EXEC SP_001_Users @Action = N'SelectUser'");
        // Không trả password về FE.
        return rows.Select(r =>
        {
            var d = (IDictionary<string, object>)r;
            d.Remove("Password");
            return (dynamic)d;
        });
    }

    public async Task<dynamic?> GetAsync(int id)
    {
        var row = await _db.OneAsync(
            "EXEC SP_001_Users @Action = N'SelectUserTheoID', @Idx = @Id",
            new { Id = id });
        if (row is null) return null;
        var d = (IDictionary<string, object>)row;
        d.Remove("Password");
        return d;
    }

    public async Task<(bool ok, string message, int? id)> CreateAsync(UserUpsertRequest req, int operatorUserId)
    {
        if (string.IsNullOrWhiteSpace(req.UserCode)) return (false, "Thiếu mã người dùng", null);
        if (string.IsNullOrWhiteSpace(req.UserName)) return (false, "Thiếu tên người dùng", null);
        if (string.IsNullOrWhiteSpace(req.Password)) return (false, "Thiếu mật khẩu", null);

        var encrypted = _crypt.HashPassword(req.Password!);
        const string sql = @"
EXEC SP_001_Users
    @Action      = N'InsertUser',
    @UserCode    = @UserCode,
    @UserName    = @UserName,
    @Password    = @Password,
    @TamNgung    = @TamNgung,
    @NguoiTao    = @Operator,
    @NgayTao     = NULL,
    @NguoiCapNhat = @Operator,
    @NgayCapNhat = NULL,
    @Huy         = 0,
    @MoTa1       = @MoTa1,
    @MoTa2       = @MoTa2,
    @MoTa3       = @MoTa3,
    @MoTa4       = @MoTa4";

        try
        {
            var row = await _db.OneAsync(sql, new
            {
                req.UserCode,
                req.UserName,
                Password = encrypted,
                TamNgung = req.TamNgung ? 1 : 0,
                Operator = operatorUserId,
                MoTa1 = req.MoTaMay ?? "",
                MoTa2 = req.MoTaKetNoiMay ?? "",
                MoTa3 = req.MoTaKetNoiTiVi ?? "",
                MoTa4 = req.MoTaKetNoiAmThanh ?? "",
            });

            int? newId = null;
            if (row is IDictionary<string, object> d && d.TryGetValue("User_Id", out var v) && v != null)
            {
                newId = Convert.ToInt32(v);
            }
            return (true, "Thêm người dùng thành công", newId);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Insert user failed");
            return (false, ex.Message, null);
        }
    }

    public async Task<(bool ok, string message)> UpdateAsync(int id, UserUpsertRequest req, int operatorUserId)
    {
        if (id <= 0) return (false, "Thiếu id");
        if (string.IsNullOrWhiteSpace(req.UserCode)) return (false, "Thiếu mã người dùng");
        if (string.IsNullOrWhiteSpace(req.UserName)) return (false, "Thiếu tên người dùng");

        // Nếu không truyền password mới, load password cũ để đưa vào SP (SP không có nhánh skip password).
        string encrypted;
        if (!string.IsNullOrWhiteSpace(req.Password))
        {
            encrypted = _crypt.HashPassword(req.Password!);
        }
        else
        {
            var current = await _db.OneAsync(
                "EXEC SP_001_Users @Action = N'CheckChangePassword', @User_Id = @Id",
                new { Id = id });
            var d = current as IDictionary<string, object>;
            encrypted = d?.TryGetValue("Password", out var v) == true ? v?.ToString() ?? "" : "";
        }

        const string sql = @"
EXEC SP_001_Users
    @Action      = N'UpdateUser',
    @UserCode    = @UserCode,
    @UserName    = @UserName,
    @Password    = @Password,
    @TamNgung    = @TamNgung,
    @NguoiTao    = @Operator,
    @NgayTao     = NULL,
    @NguoiCapNhat = @Operator,
    @NgayCapNhat = NULL,
    @Huy         = 0,
    @Idx         = @Id,
    @MoTa1       = @MoTa1,
    @MoTa2       = @MoTa2,
    @MoTa3       = @MoTa3,
    @MoTa4       = @MoTa4";

        try
        {
            await _db.ExecuteAsync(sql, new
            {
                Id = id,
                req.UserCode,
                req.UserName,
                Password = encrypted,
                TamNgung = req.TamNgung ? 1 : 0,
                Operator = operatorUserId,
                MoTa1 = req.MoTaMay ?? "",
                MoTa2 = req.MoTaKetNoiMay ?? "",
                MoTa3 = req.MoTaKetNoiTiVi ?? "",
                MoTa4 = req.MoTaKetNoiAmThanh ?? "",
            });
            return (true, "Cập nhật người dùng thành công");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Update user failed");
            return (false, ex.Message);
        }
    }

    public async Task<(bool ok, string message)> DeleteAsync(int id, int operatorUserId)
    {
        if (id <= 0) return (false, "Thiếu id");
        try
        {
            await _db.ExecuteAsync(
                "EXEC SP_001_Users @Action = N'DeleteUser', @Idx = @Id, @NguoiCapNhat = @Operator",
                new { Id = id, Operator = operatorUserId });
            return (true, "Đã xóa người dùng");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Delete user failed");
            return (false, ex.Message);
        }
    }
}
