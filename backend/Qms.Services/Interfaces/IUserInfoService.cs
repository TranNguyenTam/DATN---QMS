using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface IUserInfoService
{
    Task<object> GetInfoUserAsync(string userCode);
}
