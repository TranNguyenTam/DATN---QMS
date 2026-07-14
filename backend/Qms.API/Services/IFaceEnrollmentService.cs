namespace Qms.API.Services;

public record EnrollResult(bool Ok, string Message, long? Id);

public record EnrolledRecord(
    string MaYTe,
    string? HoTen,
    DateTime EnrolledAt,
    int ActiveImages);

public interface IFaceEnrollmentService
{
    Task<EnrollResult> EnrollAsync(
        string maYTe,
        string? hoTen,
        byte[] imageBytes,
        string fileName,
        int? userId,
        string? clientIp,
        string? userAgent,
        CancellationToken ct = default);

    Task<bool> RevokeAsync(string maYTe, int? userId, string? clientIp, CancellationToken ct = default);

    Task<IReadOnlyList<EnrolledRecord>> ListActiveAsync(CancellationToken ct = default);

    Task<IReadOnlyList<FaceIdentifyCandidate>> LoadCandidatesAsync(CancellationToken ct = default);
}
