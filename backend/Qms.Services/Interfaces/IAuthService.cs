using Qms.Core.DTOs;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface IAuthService
{
    Task<AuthRes> LoginAsync(string username, string password);
    Task<AuthRes> LoadSessionAsync(string userCode);
    Task<AuthRes> RefreshTokenAsync(string refreshToken);
    Task<(bool ok, string message)> ChangePasswordAsync(int userId, string oldPassword, string newPassword);
}
