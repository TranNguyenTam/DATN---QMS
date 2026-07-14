using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Qms.API.Services;

public class FaceAiClient : IFaceAiClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FaceAiClient> _logger;

    public FaceAiClient(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<FaceAiClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    private string BaseUrl => (_configuration["FaceAi:BaseUrl"] ?? "http://localhost:5010").TrimEnd('/');

    // Tạo HttpClient kèm shared-secret header để service Python (nếu bật
    // FACE_INTERNAL_TOKEN) chấp nhận request. Local/dev không bật token thì header
    // bị bỏ qua — không phá luồng.
    private HttpClient CreateClient(int timeoutSeconds)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        var token = _configuration["FaceAi:InternalToken"];
        if (!string.IsNullOrWhiteSpace(token))
            client.DefaultRequestHeaders.Add("X-Internal-Token", token);
        return client;
    }

    public async Task<(bool ok, string message)> CheckHealthAsync(CancellationToken ct = default)
    {
        try
        {
            var client = CreateClient(10);
            using var response = await client.GetAsync(BaseUrl + "/health", ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                return (false, $"AI service {(int)response.StatusCode}: {body}");
            }

            using var doc = JsonDocument.Parse(body);
            var ok = doc.RootElement.TryGetProperty("ok", out var okEl) && okEl.GetBoolean();
            var model = doc.RootElement.TryGetProperty("model", out var modelEl) ? modelEl.GetString() : null;
            return (ok, ok ? $"{model} ready" : "model chưa sẵn sàng");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Face AI health check failed");
            return (false, ex.Message);
        }
    }

    public async Task<FaceEmbedResult> EmbedAsync(byte[] imageBytes, string fileName, CancellationToken ct = default)
    {
        try
        {
            using var content = new MultipartFormDataContent();
            var stream = new ByteArrayContent(imageBytes);
            stream.Headers.ContentType = new MediaTypeHeaderValue(GuessMime(fileName));
            content.Add(stream, "image", string.IsNullOrWhiteSpace(fileName) ? "frame.jpg" : fileName);

            var client = CreateClient(30);
            using var response = await client.PostAsync(BaseUrl + "/embed", content, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                return new FaceEmbedResult(false, null, body);
            }

            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("embedding", out var emb) || emb.ValueKind != JsonValueKind.Array)
            {
                return new FaceEmbedResult(false, null, "Thiếu trường embedding");
            }

            var vec = new float[emb.GetArrayLength()];
            int i = 0;
            foreach (var x in emb.EnumerateArray())
            {
                vec[i++] = x.GetSingle();
            }
            return new FaceEmbedResult(true, vec, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Face AI embed failed");
            return new FaceEmbedResult(false, null, ex.Message);
        }
    }

    public async Task<FaceIdentifyResult> IdentifyAsync(
        byte[] imageBytes,
        IReadOnlyList<FaceIdentifyCandidate> candidates,
        CancellationToken ct = default)
    {
        try
        {
            var payload = new
            {
                image_b64 = Convert.ToBase64String(imageBytes),
                candidates = candidates.Select(c => new
                {
                    patientCode = c.PatientCode,
                    embedding = c.Embedding,
                }),
            };

            var client = CreateClient(30);
            using var response = await client.PostAsJsonAsync(BaseUrl + "/identify", payload, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                return new FaceIdentifyResult(false, null, 0d, 0d, body);
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            return new FaceIdentifyResult(
                Recognized: root.TryGetProperty("recognized", out var r) && r.GetBoolean(),
                PatientCode: root.TryGetProperty("patientCode", out var pc) && pc.ValueKind == JsonValueKind.String ? pc.GetString() : null,
                Confidence: root.TryGetProperty("confidence", out var cf) ? cf.GetDouble() : 0d,
                Threshold: root.TryGetProperty("threshold", out var th) ? th.GetDouble() : 0d,
                Error: null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Face AI identify failed");
            return new FaceIdentifyResult(false, null, 0d, 0d, ex.Message);
        }
    }

    public async Task<CameraStatusResult> GetCameraStatusAsync(CancellationToken ct = default)
    {
        try
        {
            var client = CreateClient(5);
            using var response = await client.GetAsync(BaseUrl + "/camera/status", ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
                return new CameraStatusResult(false, $"AI {(int)response.StatusCode}", null, null);

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            return new CameraStatusResult(
                HikAvailable: root.TryGetProperty("hikAvailable", out var ha) && ha.GetBoolean(),
                Reason: root.TryGetProperty("reason", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null,
                Ip: root.TryGetProperty("ip", out var ip) && ip.ValueKind == JsonValueKind.String ? ip.GetString() : null,
                Stream: root.TryGetProperty("stream", out var s) && s.ValueKind == JsonValueKind.Number ? s.GetInt32() : null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Camera status check failed");
            return new CameraStatusResult(false, ex.Message, null, null);
        }
    }

    public async Task<byte[]?> GetCameraSnapshotAsync(CancellationToken ct = default)
    {
        try
        {
            var client = CreateClient(8);
            using var response = await client.GetAsync(BaseUrl + "/camera/snapshot", ct);
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadAsByteArrayAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Camera snapshot failed");
            return null;
        }
    }

    private static string GuessMime(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".bmp" => "image/bmp",
            _ => "image/jpeg",
        };
    }
}
