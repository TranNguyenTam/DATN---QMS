using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Qms.Core.DTOs;

public class UserDto
{
    public int UserId { get; set; }
    public string UserCode { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    [JsonIgnore]
    public string Password { get; set; } = string.Empty;
    public string? TenTivi { get; set; }
    public string? TenAmThanh { get; set; }
    public List<PermissionDto> Permissions { get; set; } = new();
    public List<int> PhongBanIds { get; set; } = new();
    public List<int> HangDoiIds { get; set; } = new();
}

public class PermissionDto
{
    public int MenuId { get; set; }
    public string MenuCode { get; set; } = string.Empty;
    public string MenuName { get; set; } = string.Empty;
}
