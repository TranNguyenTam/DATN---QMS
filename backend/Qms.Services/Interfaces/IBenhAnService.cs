namespace Qms.Services.Interfaces;

public interface IBenhAnService
{
    /// <summary>
    /// Tạo bệnh án + chỉ định CLS + đơn thuốc.
    /// CLS/CDHA: chỉ tạo phiếu chỉ định (DichVuYeuCau) — KHÔNG tự đẩy hàng đợi
    /// (mô hình scan-on-arrival: BN cầm phiếu tới phòng, KTV quét mới vào HĐ).
    /// Viện phí + Nhà thuốc: vẫn auto-push (mỗi loại 1 quầy, không mơ hồ).
    /// Trả về danh sách phiếu để FE in (kèm barcode/QR).
    /// </summary>
    Task<BenhAnCreateResult> CreateBenhAnAsync(BenhAnCreateReq req, int userId, string? userName);

    /// <summary>Chi tiết 1 bệnh án (kèm chỉ định + thuốc).</summary>
    Task<BenhAnDetailDto?> GetBenhAnDetailAsync(int benhAnId);

    /// <summary>Bệnh án của 1 lượt khám theo HangDoiPhongBan_Id (null nếu chưa có)
    /// — để màn Khám load lại form sửa, không mất record cũ.</summary>
    Task<BenhAnDetailDto?> GetBenhAnByHangDoiPhongBanAsync(int hangDoiPhongBanId);

    /// <summary>Lịch sử bệnh án 1 BN (mới nhất trước).</summary>
    Task<IEnumerable<dynamic>> GetLichSuByBenhNhanAsync(int benhNhanId, int top = 20);

    /// <summary>Danh sách bệnh án đã khám lọc theo ngày/phòng/từ khóa.</summary>
    Task<IEnumerable<dynamic>> GetDanhSachBenhAnAsync(
        DateTime tuNgay, DateTime denNgay, int phongBanId, string keyword);

    /// <summary>DM_DichVu theo LoaiDV (KhamBenh / CLS / CDHA / Thuoc).</summary>
    Task<IEnumerable<dynamic>> GetDichVuByLoaiAsync(string loai);

    /// <summary>Lý do khám + BS chỉ định từ phiếu tiếp nhận — để prefill form bệnh án
    /// (bác sĩ không phải gõ lại lý do khám đã nhập lúc tiếp nhận).</summary>
    Task<dynamic?> GetTiepNhanLyDoAsync(int tiepNhanId);
}
