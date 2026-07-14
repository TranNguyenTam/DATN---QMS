namespace Qms.Core.DTOs;

public class MenuUpsertRequest
{
    public int? Id { get; set; }
    public string MenuCode { get; set; } = string.Empty;
    public string MenuName { get; set; } = string.Empty;
    public int? ParentMenu { get; set; }
    public bool TamNgung { get; set; }
}

public class NoiDungDacBietUpsertRequest
{
    public int? Id { get; set; }
    public string TenNoiDung { get; set; } = string.Empty;
    public string? Loai { get; set; }
    public int? PhongBanId { get; set; }
    public int? HangDoiId { get; set; }
    public int? IdLienQuan { get; set; }
    public bool TamNgung { get; set; }
}

public class ThoiGianDichVuUpsertRequest
{
    public int? Id { get; set; }
    public int SoPhut { get; set; }
    public int DichVuId { get; set; }
    public bool TamNgung { get; set; }
}

public class PermissionMenuSaveRequest
{
    public int UserId { get; set; }
    public int[] MenuIds { get; set; } = Array.Empty<int>();
}

public class PermissionUserPbHdSaveRequest
{
    public int UserId { get; set; }
    public int[] PhongBanIds { get; set; } = Array.Empty<int>();
    public int[] HangDoiIds { get; set; } = Array.Empty<int>();
}
