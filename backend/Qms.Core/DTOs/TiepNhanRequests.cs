namespace Qms.Services.Interfaces;

public class TuDongTiepNhanReq
{
    public int BenhNhanId { get; set; }
    public int UuTien { get; set; }
    public int? DichVuId { get; set; }
    public int ThuTienSau { get; set; }
    public string? LoaiUuTienText { get; set; }
    // Lượt "lấy số nhanh" (ẩn danh) đang được quầy tiếp nhận — gán BenhNhan_Id vào
    // lượt này để QR theo dõi (?id=) tự nhảy theo hành trình sang Khám.
    public int TiepNhanHangDoiPhongBanId { get; set; }
}
