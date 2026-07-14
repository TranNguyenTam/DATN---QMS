using Qms.Core.DTOs;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface ISocketService
{
    Task SendPublicMessageAsync(WSocketPayload payload);

    // Shorthand helper cho controllers
    Task SendAsync(string eventName, int? hangDoiId, int? phongBanId);
}
