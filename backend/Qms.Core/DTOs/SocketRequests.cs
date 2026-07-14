namespace Qms.Core.DTOs;

public class WSocketPayload
{
    public int? HangDoiId { get; set; }
    public int? PhongBanId { get; set; }
    public string Event { get; set; } = string.Empty;
}

public static class EventSocket
{
    public const string GOI_BN = "GOI_BN";
    public const string BO_QUA = "BO_QUA";
    public const string XOA_BN = "XOA_BN";
    public const string GOI_LAI = "GOI_LAI";
    public const string THEM_BN = "THEM_BN";
}

public class GoiTiepTheoRequest
{
    public int HangDoiId { get; set; }
    public int PhongBanId { get; set; }
}

public class UpdateBNRequest
{
    public int HangDoiId { get; set; }
    public int PhongBanId { get; set; }
}
