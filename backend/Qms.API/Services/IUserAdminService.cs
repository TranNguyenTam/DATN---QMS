using Qms.Core.DTOs;

namespace Qms.API.Services;

public interface IUserAdminService
{
    Task<IEnumerable<dynamic>> ListAsync();
    Task<dynamic?> GetAsync(int id);
    Task<(bool ok, string message, int? id)> CreateAsync(UserUpsertRequest req, int operatorUserId);
    Task<(bool ok, string message)> UpdateAsync(int id, UserUpsertRequest req, int operatorUserId);
    Task<(bool ok, string message)> DeleteAsync(int id, int operatorUserId);
}
