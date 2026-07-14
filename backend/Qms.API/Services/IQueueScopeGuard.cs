using System.Security.Claims;

namespace Qms.API.Services;

/// <summary>
/// Kiểm tra user (theo JWT) chỉ được THAO TÁC trên hàng đợi/phòng ban đã được
/// phân công trong <c>Sys_Users_PhongBan</c>. Dùng ở các endpoint gọi/bỏ qua/
/// gọi lại để chặn "dùng phòng ban này gọi hàng đợi của phòng ban khác".
///
/// Trước đây việc lọc chỉ nằm ở FE (dropdown), backend tin tham số client gửi
/// nên bất kỳ user đăng nhập nào cũng gọi được hàng đợi bất kỳ qua API.
/// </summary>
public interface IQueueScopeGuard
{
    /// <summary>
    /// Ném <c>AppException(FORBIDDEN)</c> nếu user không được phân công
    /// <paramref name="hangDoiId"/> hoặc <paramref name="phongBanId"/>.
    /// Bỏ qua tham số ≤ 0 (không kiểm). ADMIN bypass.
    /// </summary>
    Task EnsureAsync(ClaimsPrincipal user, int hangDoiId = 0, int phongBanId = 0);
}
