using Qms.Core.DTOs;

namespace Qms.API.Services;

public interface IDanhMucAdminService
{
    // Nội dung đặc biệt
    Task<IEnumerable<dynamic>> NoiDungListAsync();
    Task<IEnumerable<dynamic>> HangDoiPhongBanOptionsAsync();
    Task<IEnumerable<dynamic>> HangDoiOptionsAsync();
    Task<(bool ok, string message)> NoiDungCreateAsync(NoiDungDacBietUpsertRequest req, int opId);
    Task<(bool ok, string message)> NoiDungUpdateAsync(int id, NoiDungDacBietUpsertRequest req, int opId);
    Task<(bool ok, string message)> NoiDungDeleteAsync(int id, int opId);

    // Thời gian thực hiện DV
    Task<IEnumerable<dynamic>> ThoiGianListAsync();
    Task<IEnumerable<dynamic>> DichVuOptionsAsync();
    Task<(bool ok, string message)> ThoiGianCreateAsync(ThoiGianDichVuUpsertRequest req, int opId);
    Task<(bool ok, string message)> ThoiGianUpdateAsync(int id, ThoiGianDichVuUpsertRequest req, int opId);
    Task<(bool ok, string message)> ThoiGianDeleteAsync(int id, int opId);

    // Phân quyền user - phòng ban - hàng đợi
    Task<IEnumerable<dynamic>> UserOptionsAsync();
    Task<IEnumerable<dynamic>> GetPhongBanOfUserAsync(int userId);
    Task<IEnumerable<dynamic>> GetHangDoiOfUserAsync(int userId);
    Task<(bool ok, string message)> SaveUserPhongBanHangDoiAsync(PermissionUserPbHdSaveRequest req, int opId);
}
