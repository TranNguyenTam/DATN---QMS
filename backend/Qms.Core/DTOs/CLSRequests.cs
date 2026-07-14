namespace Qms.Core.DTOs;

public class GoiTiepTheoCLSRequest
{
    public int HangDoiId { get; set; }
    public int PhongBanId { get; set; }
    public int HangDoiPhongBanId { get; set; }
}

public class GoiBenhDaChonCLSRequest
{
    public int HangDoiId { get; set; }
    public int PhongBanId { get; set; }
    public int HangDoiPhongBanId { get; set; }
}

public class UpdateNhanBenhCLSRequest
{
    public int HangDoiId { get; set; }
    public int HangDoiPhongBanId { get; set; }
    public string? ThoiGian { get; set; }
    public int? UuTien { get; set; }
    public int? SoLuongChiDinh { get; set; }
    public string? NoiDung { get; set; }
}

public class ThemBnCheckInClsReq
{
    public int HangDoiId { get; set; }
    public int UuTien { get; set; }
    public int BenhNhanId { get; set; }
    public int ClsYeuCauId { get; set; }
    public string LoaiPhieu { get; set; } = string.Empty;
    public string NoiDung { get; set; } = string.Empty;
    public int SoLuongChiDinh { get; set; }
}
