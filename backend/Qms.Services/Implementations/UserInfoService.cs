using Qms.Core.Exceptions;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class UserInfoService : IUserInfoService
{
    private readonly IDatabaseHelper _db;

    public UserInfoService(IDatabaseHelper db)
    {
        _db = db;
    }

    public async Task<object> GetInfoUserAsync(string userCode)
    {
        const string userSql = @"
            SELECT TOP 1 User_Id as UserId, UserCode, UserName, TenTivi, TenAmThanh
            FROM Sys_Users
            WHERE UserCode = @UserCode AND tamNgung = 0 AND huy = 0";

        var userRow = await _db.OneAsync(userSql, new { UserCode = userCode });
        if (userRow == null) throw new AppException(ErrorCode.UNAUTHORIZED);

        int userId = userRow.UserId;
        bool isAdmin = string.Equals((string)userRow.UserCode, "ADMIN",
            StringComparison.OrdinalIgnoreCase);

        // ADMIN bypass: thấy toàn bộ phòng ban + hàng đợi active.
        // User thường bị filter theo Sys_Users_PhongBan / SP_002 CBBHangDoi.
        string hangDoiSql = isAdmin
            ? @"SELECT
                    HangDoi_Id     AS FieldCode,
                    TenHangDoi     AS FieldName,
                    KyTuSTT
                FROM DM_HangDoi WITH (NOLOCK)
                WHERE Huy = 0 AND TamNgung = 0
                ORDER BY HangDoi_Id"
            : "EXEC SP_002_HangDoiPhongBan @Action = N'CBBHangDoi', @User_Id = @UserId";

        string phongBanSql = isAdmin
            ? @"SELECT
                    p.PhongBan_Id       AS FieldCode,
                    p.TenPhongBanDayDu,
                    UPPER(p.TenPhongBan) AS FieldName
                FROM DM_PhongBan p WITH (NOLOCK)
                WHERE p.Huy = 0 AND p.TamNgung = 0
                ORDER BY p.PhongBan_Id"
            : @"SELECT
                    p.PhongBan_Id       AS FieldCode,
                    p.TenPhongBanDayDu,
                    UPPER(p.TenPhongBan) AS FieldName
                FROM DM_PhongBan p WITH (NOLOCK)
                INNER JOIN Sys_Users_PhongBan s WITH (NOLOCK)
                    ON p.PhongBan_Id = s.PhongBan_Id
                WHERE p.Huy = 0
                  AND p.TamNgung = 0
                  AND s.User_Id = @UserId
                ORDER BY p.PhongBan_Id";

        var hangDoiTask = _db.ListAsync(hangDoiSql, new { UserId = userId });
        var phongBanTask = _db.ListAsync(phongBanSql, new { UserId = userId });

        var (hangDoiRes, phongBanRes) = (await hangDoiTask, await phongBanTask);

        var hangDois = System.Linq.Enumerable.ToList(hangDoiRes);
        var phongBans = System.Linq.Enumerable.ToList(phongBanRes);

        return new
        {
            FullName = (string?)userRow.UserName,  // tên hiển thị (vd tên bác sĩ)
            HangDoi = hangDois.Count > 0 ? hangDois[0] : null,
            PhongBan = phongBans.Count > 0 ? phongBans[0] : null,
            HangDoiList = hangDois,
            PhongBanList = phongBans,
            IsAdmin = isAdmin,
            Devices = new
            {
                UserCode = (string)userRow.UserCode,
                TenTivi = (string?)userRow.TenTivi,
                TenAmThanh = (string?)userRow.TenAmThanh
            }
        };
    }
}
