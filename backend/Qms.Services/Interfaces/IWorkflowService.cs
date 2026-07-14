namespace Qms.Services.Interfaces;

public interface IWorkflowService
{
    // === CLS / CDHA ===
    Task<dynamic?> GetCLSPendingByHdpbAsync(int hangDoiPhongBanId);
    Task<int> TraKetQuaCLSAsync(TraKetQuaCLSReq req, int ktvId, string? ktvName);

    // === Viện phí ===
    Task<dynamic?> GetHoaDonDraftAsync(int tiepNhanId);   // tính phí phải thu (chưa lưu)
    Task<int> LapHoaDonAsync(LapHoaDonReq req, int userId, string? userName);
    Task<bool> ThuTienAsync(ThuTienReq req, int userId, string? userName);
    Task<dynamic?> GetHoaDonByTiepNhanAsync(int tiepNhanId);
    Task<IEnumerable<dynamic>> GetHoaDonDaThuAsync();     // HĐ đã thu hôm nay (xem/in lại)

    // === Nhà thuốc ===
    Task<IEnumerable<dynamic>> GetDonThuocChoPhatAsync(int benhNhanId);
    Task<bool> PhatThuocAsync(PhatThuocReq req, int userId, string? userName);
}
