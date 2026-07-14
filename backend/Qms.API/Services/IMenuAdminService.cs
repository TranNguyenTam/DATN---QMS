using Qms.Core.DTOs;

namespace Qms.API.Services;

public interface IMenuAdminService
{
    Task<IEnumerable<dynamic>> ListAsync();
    Task<IEnumerable<dynamic>> ParentOptionsAsync();
    Task<(bool ok, string message)> CreateAsync(MenuUpsertRequest req, int opId);
    Task<(bool ok, string message)> UpdateAsync(int id, MenuUpsertRequest req, int opId);
    Task<(bool ok, string message)> DeleteAsync(int id, int opId);
}
