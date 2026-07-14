namespace Qms.API.Services;

public interface IWaitTimeEstimator
{
    Task<object> EstimateAsync(int hangDoiId, int priorityWeight);

    /// <summary>
    /// Dự báo riêng cho 1 BN theo STT. Trả về:
    /// - aheadCount: số BN trước mình trong queue (chưa NgayGioThucHien, STT thấp hơn)
    /// - waitMinutes: aheadCount × avgServiceTime / activeCounters
    /// - estimatedAt: thời điểm dự kiến đến lượt (ISO 8601, theo giờ server)
    /// - currentSTT: STT đang được gọi (đã có NgayGioThucHien mới nhất)
    /// Dùng cho PWA mobile và Tivi cá nhân hóa.
    /// </summary>
    Task<object> EstimatePersonalAsync(int hangDoiId, int stt);

    /// <summary>
    /// Như EstimatePersonalAsync nhưng tra theo HangDoiPhongBan_Id (khóa chính) —
    /// chắc chắn, tránh nhập nhằng STT/SoThuTuDayDu khi số hiển thị có prefix.
    /// Dùng cho QR theo dõi của bệnh nhân (PWA).
    /// </summary>
    Task<object> EstimatePersonalByIdAsync(int hangDoiPhongBanId);

    /// <summary>
    /// Theo dõi cả HÀNH TRÌNH của BN trong ngày (tiếp nhận → khám → CLS → viện phí
    /// → thuốc). Tự tìm bước hiện tại (bản ghi chưa hoàn tất, mới nhất) theo
    /// BenhNhan_Id và trả về dự báo cho bước đó. Hết bước → trả shape rỗng.
    /// </summary>
    Task<object> EstimateJourneyByBenhNhanAsync(int benhNhanId);
}
