using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Qms.Core.DTOs;

public class AuthRes
{
    // Java AuthRes uses camelCase — FE reads: userId, userCode, userName, tivi, amThanh, permissions, token, refreshToken
    [JsonPropertyName("userId")]
    public int UserId { get; set; }

    [JsonPropertyName("userCode")]
    public string UserCode { get; set; } = string.Empty;

    [JsonPropertyName("userName")]
    public string UserName { get; set; } = string.Empty;

    [JsonPropertyName("tivi")]
    public bool Tivi { get; set; }

    [JsonPropertyName("amThanh")]
    public bool AmThanh { get; set; }

    [JsonPropertyName("permissions")]
    public List<string> Permissions { get; set; } = new();

    [JsonPropertyName("roles")]
    public List<string> Roles { get; set; } = new();

    [JsonPropertyName("token")]
    public string? Token { get; set; }

    [JsonPropertyName("refreshToken")]
    public string? RefreshToken { get; set; }
}
