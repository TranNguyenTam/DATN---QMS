using Microsoft.AspNetCore.SignalR;
using Qms.API.Hubs;
using Qms.Core.DTOs;
using Qms.Services.Interfaces;
using System.Threading.Tasks;

namespace Qms.API.Services;

public class SocketProvider : ISocketService
{
    private readonly IHubContext<QueueHub> _hubContext;

    public SocketProvider(IHubContext<QueueHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task SendPublicMessageAsync(WSocketPayload payload)
        => _hubContext.Clients.All.SendAsync("ReceiveMessage", payload);

    public Task SendAsync(string eventName, int? hangDoiId, int? phongBanId)
    {
        var payload = new WSocketPayload
        {
            Event = eventName,
            HangDoiId = hangDoiId,
            PhongBanId = phongBanId
        };
        return _hubContext.Clients.All.SendAsync("ReceiveMessage", payload);
    }
}
