using Microsoft.AspNetCore.SignalR;
using Qms.Core.DTOs;
using Qms.Infrastructure.Utils;
using System;
using System.Collections.Generic;

namespace Qms.API.Hubs;

public class QueueHub : Hub
{
	private readonly DeviceRegistry _deviceRegistry;

	public QueueHub(DeviceRegistry deviceRegistry)
	{
		_deviceRegistry = deviceRegistry;
	}

	public async Task SendMessage(Dictionary<string, object>? payload)
	{
		if (payload == null) return;

		var hasDeviceName = payload.TryGetValue("deviceName", out var rawDeviceName);
		var hasDeviceType = payload.TryGetValue("deviceType", out var rawDeviceType);
		var deviceName = rawDeviceName?.ToString()?.Trim();
		var deviceType = rawDeviceType?.ToString()?.Trim();

		if (hasDeviceName && hasDeviceType && !string.IsNullOrWhiteSpace(deviceName))
		{
			_deviceRegistry.Register(new DeviceInfo
			{
				SessionId = Context.ConnectionId,
				DeviceName = deviceName,
				DeviceType = deviceType,
				Status = "CONNECTED",
				LastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
			});

			await Clients.All.SendAsync("DeviceStatus", _deviceRegistry.GetAll());
		}
	}

	public override async Task OnDisconnectedAsync(Exception? exception)
	{
		_deviceRegistry.Delete(Context.ConnectionId);
		await Clients.All.SendAsync("DeviceStatus", _deviceRegistry.GetAll());
		await base.OnDisconnectedAsync(exception);
	}
}
