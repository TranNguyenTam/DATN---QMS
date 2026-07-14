namespace Qms.API.Services;

public record FaceEmbedResult(bool Ok, float[]? Embedding, string? Error);

public record FaceIdentifyCandidate(string PatientCode, float[] Embedding);

public record FaceIdentifyResult(
    bool Recognized,
    string? PatientCode,
    double Confidence,
    double Threshold,
    string? Error);

public record CameraStatusResult(bool HikAvailable, string? Reason, string? Ip, int? Stream);

public interface IFaceAiClient
{
    Task<(bool ok, string message)> CheckHealthAsync(CancellationToken ct = default);

    // Trả embedding vector (Facenet512 = 512 float) cho luồng enroll.
    Task<FaceEmbedResult> EmbedAsync(byte[] imageBytes, string fileName, CancellationToken ct = default);

    // So ảnh hiện tại với list embedding đã đăng ký, trả best match.
    Task<FaceIdentifyResult> IdentifyAsync(
        byte[] imageBytes,
        IReadOnlyList<FaceIdentifyCandidate> candidates,
        CancellationToken ct = default);

    // Camera Hikvision proxy
    Task<CameraStatusResult> GetCameraStatusAsync(CancellationToken ct = default);
    Task<byte[]?> GetCameraSnapshotAsync(CancellationToken ct = default);
}
