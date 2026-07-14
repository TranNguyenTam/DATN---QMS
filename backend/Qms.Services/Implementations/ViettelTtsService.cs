using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace Qms.Services.Implementations;

public class ViettelTtsService : IViettelTtsService
{
    private readonly IDatabaseHelper _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ViettelTtsService> _logger;
    private readonly string _viettelUrl;
    private readonly string _voice;
    private readonly double _speed;
    private readonly string _tokenFallback;

    public ViettelTtsService(IDatabaseHelper db, IHttpClientFactory httpClientFactory, IConfiguration configuration, ILogger<ViettelTtsService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        
        _viettelUrl = configuration["TtsOptions:ViettelUrl"] ?? "https://viettelai.vn/tts/speech_synthesis";
        _voice = configuration["TtsOptions:ViettelVoice"] ?? "hn-thanhphuong";
        _speed = configuration.GetValue<double>("TtsOptions:ViettelSpeed", 0.8);
        _tokenFallback = configuration["TtsOptions:ViettelToken"] ?? "";
    }

    public async Task<byte[]> SynthesizeAsync(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Text không được để trống");

        string? token = await GetTokenFromDbAsync();
        if (string.IsNullOrWhiteSpace(token))
        {
            token = _tokenFallback;
        }

        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Không tìm thấy token Viettel TTS");

        // Viettel API strict: bất kỳ whitespace nào trong token → "Token
        // không hợp lệ" 404. Strip toàn bộ ký tự trắng (space/tab/CRLF)
        // để phòng config bị dính khoảng trắng khi copy-paste.
        token = new string(token.Where(c => !char.IsWhiteSpace(c)).ToArray());

        try
        {
            var body = new
            {
                speed = _speed,
                text = text,
                token = token,
                tts_return_option = 2,
                voice = _voice,
                without_filter = true
            };

            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var client = _httpClientFactory.CreateClient();
            var request = new HttpRequestMessage(HttpMethod.Post, _viettelUrl);
            request.Headers.Add("accept", "*/*");
            request.Content = content;

            var response = await client.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!contentType.StartsWith("audio", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Viettel TTS không trả về audio hợp lệ. Content-Type=" + contentType);
            }

            return await response.Content.ReadAsByteArrayAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[TTS] Lỗi khi gọi Viettel");
            throw new InvalidOperationException("Không tạo được audio từ Viettel TTS", ex);
        }
    }

    private async Task<string?> GetTokenFromDbAsync()
    {
        string sql = "EXEC SP_001_Users @Action = 'Token'";
        var rows = await _db.ListAsync(sql);
        var first = rows.FirstOrDefault();
        if (first == null) return null;
        
        var dict = (IDictionary<string, object>)first;
        if (dict.TryGetValue("token", out var tokenVal))
            return tokenVal?.ToString();
            
        return null; // fallback
    }
}
