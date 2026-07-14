using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Qms.Infrastructure.Utils;
using System;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface IViettelTtsService
{
    Task<byte[]> SynthesizeAsync(string text);
}
