using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Qms.Infrastructure.Utils;

public class JwtUtil
{
    private readonly string _secretKey;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _expirationAccessSeconds = 86400; // 1 day

    public JwtUtil(IConfiguration configuration)
    {
        _secretKey = configuration["Jwt:Secret"] ?? string.Empty;
        _issuer = configuration["Jwt:Issuer"] ?? "QMS";
        _audience = configuration["Jwt:Audience"] ?? "QMS";
    }

    /// <summary>
    /// Generate JWT with userCode (sub), userId, roles, permissions claims.
    /// Roles: 1 claim 'role' per role. Permissions: 1 claim 'perm' per key.
    /// FE đọc roles để filter menu/route; BE check [Authorize(Roles="...")].
    /// </summary>
    public string GenerateToken(string userCode, int userId = 0,
        IEnumerable<string>? roles = null, IEnumerable<string>? permissions = null)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_secretKey);

        var claims = new System.Collections.Generic.List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, userCode),
            new Claim("userId", userId.ToString()),
            new Claim("user_id", userId.ToString()),
        };

        if (roles != null)
            foreach (var r in roles)
                if (!string.IsNullOrWhiteSpace(r))
                    claims.Add(new Claim(ClaimTypes.Role, r));

        if (permissions != null)
            foreach (var p in permissions)
                if (!string.IsNullOrWhiteSpace(p))
                    claims.Add(new Claim("perm", p));

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddSeconds(_expirationAccessSeconds),
            Issuer = _issuer,
            Audience = _audience,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    public string GenerateRefreshTokenRaw()
    {
        var randomBytes = new byte[32];
        using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create())
        {
            rng.GetBytes(randomBytes);
        }
        return Guid.NewGuid().ToString() + "-" + Convert.ToBase64String(randomBytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}
