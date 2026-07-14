using Qms.Core.DTOs;

namespace Qms.API.Services;

/// <summary>
/// 4 nhóm tính năng EMR-light (Pha 5):
///  1. Tạo bệnh nhân mới + thẻ BHYT (form 14 trường).
///  2. Tạo phiếu tiếp nhận có Lý do khám + BS chỉ định.
///  3. Cung cấp danh mục đối tượng BHYT cho dropdown.
///  4. Chỉ định CLS (autocomplete dịch vụ + bulk insert DichVuYeuCau).
/// Dùng Dapper inline SQL — KHÔNG đụng SP cũ.
/// </summary>
public interface IEmrService
{
    Task<IEnumerable<dynamic>> GetDanhMucDoiTuongAsync();
    Task<IEnumerable<dynamic>> SearchDichVuAsync(string? q, int limit = 20);
    Task<dynamic?> GetBenhNhanByMaYTeAsync(string maYTe);
    Task<dynamic> CreateBenhNhanAsync(BenhNhanCreateReq req, BhytInfo? bhyt, int opId);
    Task<dynamic> CreateTiepNhanAsync(TiepNhanCreateReq req, int opId);
    Task<dynamic> ChiDinhClsAsync(ChiDinhClsReq req, int opId);
    Task<IEnumerable<dynamic>> ListDichVuYeuCauByTiepNhanAsync(int tiepNhanId);

    // ── Pha 6: Quản lý bệnh nhân ──
    Task<PagedResult<BenhNhanListItem>> ListBenhNhanAsync(
        string? q, int? doiTuongId, int? gioiTinh, int page, int pageSize);
    Task<BenhNhanDetail?> GetBenhNhanDetailAsync(int benhNhanId);
    Task<IEnumerable<TiepNhanHistoryItem>> ListTiepNhanByBenhNhanAsync(int benhNhanId);
    Task<bool> UpdateBenhNhanAsync(int benhNhanId, BenhNhanUpdateReq req, int opId);
    Task<bool> SoftDeleteBenhNhanAsync(int benhNhanId, int opId);
}
