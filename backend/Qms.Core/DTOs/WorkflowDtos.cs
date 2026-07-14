namespace Qms.Services.Interfaces;

public class TraKetQuaCLSReq
{
    public int DVYEUCAU_ID { get; set; }
    public int HangDoiPhongBan_Id { get; set; }
    public string? KetLuan { get; set; }
    public string? KetQuaChiTiet { get; set; }
    public string? FileDinhKem { get; set; }
}

public class LapHoaDonReq
{
    public int TiepNhan_Id { get; set; }
    public int BenhNhan_Id { get; set; }
    public decimal? MienGiam { get; set; }
    public decimal? BHYT_ChiTra { get; set; }
    public string? GhiChu { get; set; }
}

public class ThuTienReq
{
    public int HoaDon_Id { get; set; }
    public string? PhuongThuc { get; set; }   // TienMat / Chuyen / The
    public int? HangDoiPhongBan_Id { get; set; }  // mark hoàn tất queue Viện phí
}

public class PhatThuocReq
{
    public int DonThuoc_Id { get; set; }
    public int? HangDoiPhongBan_Id { get; set; }
    public string? GhiChu { get; set; }
}
