namespace Qms.Core.DTOs;

public class UserUpsertRequest
{
    public int? Id { get; set; }                  // null = insert, có giá trị = update
    public string UserCode { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? Password { get; set; }         // null khi update + không đổi password
    public bool TamNgung { get; set; }
    public string? MoTaMay { get; set; }
    public string? MoTaKetNoiMay { get; set; }
    public string? MoTaKetNoiTiVi { get; set; }
    public string? MoTaKetNoiAmThanh { get; set; }
}
