namespace Qms.Core.DTOs;

public class ThemBnCheckInVpReq
{
    public int HangDoiId { get; set; }
    public int UuTien { get; set; }
    public int BenhNhanId { get; set; }
    public string LoaiPhieu { get; set; } = string.Empty;
    public string NoiDung { get; set; } = string.Empty;
}
