namespace Qms.Services.Interfaces;

/// <summary>
/// Bệnh án ngoại trú 1 lần khám — bác sĩ submit từ trang
/// /kham-benh/quan-ly sau khi gọi BN.
/// </summary>
public class BenhAnCreateReq
{
    public int HangDoiPhongBan_Id { get; set; }   // lượt khám đang xử lý
    public int TiepNhan_Id { get; set; }
    public int BenhNhan_Id { get; set; }
    public string? LyDoKham { get; set; }
    public string? TrieuChung { get; set; }
    public string ChanDoan { get; set; } = "";    // bắt buộc
    public string? ChanDoanICD { get; set; }
    public string? HuongDieuTri { get; set; }
    public string? GhiChu { get; set; }

    // Thu tiền sau khám: nếu true + có chỉ định/đơn → tự đẩy Viện phí.
    // Default true (mô hình thu sau phổ biến); FE có thể tắt nếu BN
    // đã thu trước lúc tiếp nhận.
    public bool ThuTienSau { get; set; } = true;

    // Chỉ định CLS/CDHA — list các dịch vụ kèm số lượng
    public List<ChiDinhItem> ChiDinhCLS { get; set; } = new();

    // Đơn thuốc — list thuốc với liều dùng
    public List<ThuocItem> DonThuoc { get; set; } = new();
}

public class ChiDinhItem
{
    public int DichVu_Id { get; set; }
    public int SoLuong { get; set; } = 1;
    public string? GhiChu { get; set; }
}

public class ThuocItem
{
    public int DichVu_Id { get; set; }       // ref DM_DichVu (LoaiDV='Thuoc')
    public string TenThuoc { get; set; } = "";  // snapshot
    public decimal SoLuong { get; set; } = 1;
    public string? DonViTinh { get; set; }
    public string? LieuDung { get; set; }
}

/// <summary>
/// 1 phiếu chỉ định CLS/CDHA sinh ra khi bác sĩ submit — để FE IN PHIẾU
/// (kèm barcode/QR số phiếu) đưa BN cầm tới phòng quét nhận bệnh.
/// Mô hình scan-on-arrival: KHÔNG tự đẩy vào hàng đợi; BN tới phòng,
/// KTV quét số phiếu này (ThemBnCheckIn) thì mới vào hàng đợi phòng đó.
/// </summary>
public class PhieuChiDinhInfo
{
    public string SoPhieu { get; set; } = "";
    public string TenDichVu { get; set; } = "";
    public int HangDoi_Id { get; set; }      // hàng đợi đích (6=XN,7=SÂ,8=XQ,9=ĐLX,10=CT)
    public int PhongBan_Id { get; set; }
    public string? TenPhongBan { get; set; } // tên phòng để in trên phiếu
}

/// <summary>Kết quả tạo bệnh án: id + danh sách phiếu chỉ định để FE in.</summary>
public class BenhAnCreateResult
{
    public int BenhAn_Id { get; set; }
    public List<PhieuChiDinhInfo> Phieus { get; set; } = new();
}

public class BenhAnDetailDto
{
    public int BenhAn_Id { get; set; }
    public int TiepNhan_Id { get; set; }
    public int BenhNhan_Id { get; set; }
    public string? TenBenhNhan { get; set; }
    public int? NamSinh { get; set; }
    public DateTime NgayKham { get; set; }
    public string? TenBacSi { get; set; }
    public string? LyDoKham { get; set; }
    public string? TrieuChung { get; set; }
    public string? ChanDoan { get; set; }
    public string? ChanDoanICD { get; set; }
    public string? HuongDieuTri { get; set; }
    public string? GhiChu { get; set; }
    public List<dynamic> ChiDinhCLS { get; set; } = new();
    public List<dynamic> Thuoc { get; set; } = new();
}
