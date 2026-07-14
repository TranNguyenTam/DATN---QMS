using Qms.Core.DTOs;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace Qms.Infrastructure.Utils;

public class DeviceRegistry
{
    private readonly ConcurrentDictionary<string, DeviceInfo> _devices = new();

    public void Register(DeviceInfo device)
    {
        if (device.SessionId == null) return;
        
        _devices.AddOrUpdate(device.SessionId, device, (key, existing) =>
        {
            existing.SessionId = device.SessionId;
            existing.Status = "CONNECTED";
            existing.LastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return existing;
        });
    }

    public string? Delete(string sessionId)
    {
        if (_devices.TryRemove(sessionId, out var d))
        {
            return d.DeviceName;
        }
        return null;
    }

    public IEnumerable<DeviceInfo> GetAll() => _devices.Values;

    public List<DeviceInfo> GetAllByName(string? tenTivi)
    {
        if (string.IsNullOrWhiteSpace(tenTivi))
        {
            return new List<DeviceInfo>
            {
                new DeviceInfo
                {
                    DeviceName = tenTivi,
                    DeviceType = "TV",
                    Status = "DISCONNECT",
                    LastSeen = 0,
                    SessionId = null
                }
            };
        }

        string keyword = tenTivi.ToLower();
        var matched = _devices.Values
            .Where(d => d.DeviceName != null && d.DeviceName.ToLower().Contains(keyword))
            .ToList();

        if (!matched.Any())
        {
            return new List<DeviceInfo>
            {
                new DeviceInfo
                {
                    DeviceName = tenTivi,
                    DeviceType = "TV",
                    Status = "DISCONNECT",
                    LastSeen = 0,
                    SessionId = null
                }
            };
        }

        return matched;
    }
}
