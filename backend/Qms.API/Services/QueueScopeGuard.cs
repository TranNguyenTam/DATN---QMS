using System.Security.Claims;
using Qms.Core.Exceptions;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

/// <inheritdoc cref="IQueueScopeGuard"/>
public sealed class QueueScopeGuard : IQueueScopeGuard
{
    private readonly IDatabaseHelper _db;

    public QueueScopeGuard(IDatabaseHelper db) => _db = db;

    public async Task EnsureAsync(ClaimsPrincipal user, int hangDoiId = 0, int phongBanId = 0)
    {
        // ADMIN bypass — UserCode nằm ở claim NameIdentifier (xem JwtUtil.GenerateToken).
        var userCode = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
        if (string.Equals(userCode, "ADMIN", StringComparison.OrdinalIgnoreCase))
            return;

        if (hangDoiId <= 0 && phongBanId <= 0)
            return; // không có gì để kiểm.

        int userId = 0;
        foreach (var k in new[] { "userId", "user_id" })
            if (int.TryParse(user.FindFirstValue(k), out var id) && id > 0) { userId = id; break; }
        if (userId <= 0)
            throw new AppException(ErrorCode.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ");

        // 1 query trả 2 cờ; cờ = 1 nếu tham số ≤ 0 (bỏ qua) hoặc user có dòng gán tương ứng.
        const string sql = @"
SELECT
    HangDoiOk  = CASE WHEN @hd <= 0 OR EXISTS (
        SELECT 1 FROM dbo.Sys_Users_PhongBan WITH (NOLOCK)
         WHERE User_Id = @uid AND HangDoi_Id  = @hd) THEN 1 ELSE 0 END,
    PhongBanOk = CASE WHEN @pb <= 0 OR EXISTS (
        SELECT 1 FROM dbo.Sys_Users_PhongBan WITH (NOLOCK)
         WHERE User_Id = @uid AND PhongBan_Id = @pb) THEN 1 ELSE 0 END;";
        var row = await _db.OneAsync(sql, new { uid = userId, hd = hangDoiId, pb = phongBanId });
        var d = row as IDictionary<string, object>;
        bool hdOk = d is not null && Convert.ToInt32(d["HangDoiOk"]) == 1;
        bool pbOk = d is not null && Convert.ToInt32(d["PhongBanOk"]) == 1;

        if (!hdOk)
            throw new AppException(ErrorCode.FORBIDDEN,
                "Bạn chưa được phân công hàng đợi này. Liên hệ quản trị để được gán phòng/hàng đợi.");
        if (!pbOk)
            throw new AppException(ErrorCode.FORBIDDEN,
                "Bạn chưa được phân công phòng ban này. Liên hệ quản trị để được gán phòng/hàng đợi.");
    }
}
