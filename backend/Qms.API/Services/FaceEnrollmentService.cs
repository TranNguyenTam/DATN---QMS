using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

public class FaceEnrollmentService : IFaceEnrollmentService
{
    private readonly IDatabaseHelper _db;
    private readonly IFaceAiClient _ai;
    private readonly IFaceCryptoService _crypto;
    private readonly IFaceAuditService _audit;
    private readonly IFaceGalleryCache _gallery;
    private readonly ILogger<FaceEnrollmentService> _log;

    public FaceEnrollmentService(
        IDatabaseHelper db,
        IFaceAiClient ai,
        IFaceCryptoService crypto,
        IFaceAuditService audit,
        IFaceGalleryCache gallery,
        ILogger<FaceEnrollmentService> log)
    {
        _db = db;
        _ai = ai;
        _crypto = crypto;
        _audit = audit;
        _gallery = gallery;
        _log = log;
    }

    public async Task<EnrollResult> EnrollAsync(
        string maYTe,
        string? hoTen,
        byte[] imageBytes,
        string fileName,
        int? userId,
        string? clientIp,
        string? userAgent,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(maYTe))
        {
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Fail, maYTe, userId,
                message: "Thiếu mã y tế", clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(false, "Thiếu mã y tế", null);
        }

        // Validate mã y tế TỒN TẠI + lấy TÊN THẬT từ hồ sơ — không tin tên gõ tay
        // (tránh đăng ký nhầm danh tính / sai chính tả như "Tâmm"). Không cho đăng ký
        // khuôn mặt cho mã không có bệnh nhân.
        var bnRow = await _db.OneAsync(
            "SELECT TOP 1 TENBENHNHAN FROM dbo.BenhNhan WHERE MAYTE = @MaYTe AND ACTIVE = '1'",
            new { MaYTe = maYTe });
        if (bnRow is null)
        {
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Fail, maYTe, userId,
                message: "Mã y tế không tồn tại", clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(false, $"Không tìm thấy bệnh nhân với mã y tế '{maYTe}'", null);
        }
        var tenThat = ((IDictionary<string, object>)bnRow)["TENBENHNHAN"]?.ToString();
        if (!string.IsNullOrWhiteSpace(tenThat)) hoTen = tenThat;  // luôn dùng tên thật

        var embedRes = await _ai.EmbedAsync(imageBytes, fileName, ct);
        if (!embedRes.Ok || embedRes.Embedding is null)
        {
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Fail, maYTe, userId,
                message: embedRes.Error, clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(false, embedRes.Error ?? "Không trích xuất được embedding", null);
        }

        // ── CHỐNG TRÙNG DANH TÍNH ──────────────────────────────────────────────
        // Không cho đăng ký MỘT khuôn mặt cho NHIỀU bệnh nhân. So khớp 1:N khuôn mặt
        // mới với toàn bộ gallery (cùng ngưỡng + biên an toàn như lúc check-in). Nếu
        // nó khớp một BN KHÁC → TỪ CHỐI. (Đăng ký thêm ảnh cho CHÍNH BN này thì khớp
        // chính mình, không chặn.) Up cùng 1 ảnh cho 2 mã → cosine ~1.0 → bị bắt ngay.
        var dup = await _gallery.MatchAsync(embedRes.Embedding, ct);
        if (dup.Recognized &&
            !string.Equals(dup.PatientCode, maYTe, StringComparison.OrdinalIgnoreCase))
        {
            var dupName = await _db.ScalarAsync<string>(
                "SELECT TOP 1 TENBENHNHAN FROM dbo.BenhNhan WHERE MAYTE = @M",
                new { M = dup.PatientCode });
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Fail, maYTe, userId,
                message: $"Trùng khuôn mặt BN {dup.PatientCode} (score={dup.BestScore:0.000})",
                clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(false,
                $"Khuôn mặt này đã được đăng ký cho bệnh nhân khác: {dupName ?? "?"} " +
                $"(mã {dup.PatientCode}). Không thể đăng ký trùng danh tính.", null);
        }

        byte[] blob;
        try
        {
            blob = _crypto.Encrypt(embedRes.Embedding);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Encrypt embedding failed for {MaYTe}", maYTe);
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Fail, maYTe, userId,
                message: "Encrypt lỗi", clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(false, "Không mã hóa được embedding", null);
        }

        // Append mode — giữ nhiều embedding/BN (mỗi ảnh là 1 góc khác nhau,
        // giúp giảm FRR khi nhận diện). Chỉ revoke khi cùng BN có quá 5 ảnh
        // active để tránh phình bảng.
        const int maxActivePerPatient = 5;
        const string countActiveSql = @"
SELECT COUNT(*) FROM dbo.PatientFaceEmbedding
WHERE MaYTe = @MaYTe AND RevokedAt IS NULL;";

        const string revokeOldestSql = @"
UPDATE dbo.PatientFaceEmbedding
   SET RevokedAt = SYSDATETIME(), RevokedBy = @UserId
 WHERE Id = (
    SELECT TOP 1 Id FROM dbo.PatientFaceEmbedding
    WHERE MaYTe = @MaYTe AND RevokedAt IS NULL
    ORDER BY EnrolledAt ASC
);";

        const string insertSql = @"
INSERT INTO dbo.PatientFaceEmbedding (MaYTe, HoTen, ModelName, EmbeddingEnc, KeyId, EnrolledBy, EnrolledAt)
OUTPUT INSERTED.Id
VALUES (@MaYTe, @HoTen, @ModelName, @EmbeddingEnc, @KeyId, @UserId, SYSDATETIME());";

        try
        {
            // Khóa số lượng embedding active ≤ 5: nếu đã ≥ 5, revoke embedding cũ nhất.
            var activeCount = await _db.ScalarAsync<int>(countActiveSql, new { MaYTe = maYTe });
            if (activeCount >= maxActivePerPatient)
            {
                await _db.ExecuteAsync(revokeOldestSql, new { MaYTe = maYTe, UserId = userId });
            }

            var id = await _db.ScalarAsync<long>(insertSql, new
            {
                MaYTe = maYTe,
                HoTen = hoTen,
                ModelName = "Facenet512",
                EmbeddingEnc = blob,
                KeyId = _crypto.KeyId,
                UserId = userId,
            });

            _gallery.Invalidate(); // gallery thay đổi → cache nạp lại ở lần match kế tiếp
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Success, maYTe, userId,
                message: $"id={id}, active={Math.Min(activeCount + 1, maxActivePerPatient)}",
                clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(true, $"Đã thêm ảnh khuôn mặt cho {maYTe}", id);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Insert PatientFaceEmbedding failed for {MaYTe}", maYTe);
            await _audit.WriteAsync(FaceAuditAction.Enroll, FaceAuditResult.Fail, maYTe, userId,
                message: ex.Message, clientIp: clientIp, userAgent: userAgent, ct: ct);
            return new EnrollResult(false, "Lỗi lưu DB: " + ex.Message, null);
        }
    }

    public async Task<bool> RevokeAsync(string maYTe, int? userId, string? clientIp, CancellationToken ct = default)
    {
        const string sql = @"
UPDATE dbo.PatientFaceEmbedding
   SET RevokedAt = SYSDATETIME(), RevokedBy = @UserId
 WHERE MaYTe = @MaYTe AND RevokedAt IS NULL;";
        var rows = await _db.ExecuteAsync(sql, new { MaYTe = maYTe, UserId = userId });
        if (rows > 0) _gallery.Invalidate(); // gallery thay đổi → cache nạp lại
        await _audit.WriteAsync(FaceAuditAction.Revoke,
            rows > 0 ? FaceAuditResult.Success : FaceAuditResult.Fail,
            maYTe, userId, message: $"rows={rows}", clientIp: clientIp, ct: ct);
        return rows > 0;
    }

    public async Task<IReadOnlyList<EnrolledRecord>> ListActiveAsync(CancellationToken ct = default)
    {
        // Gom theo MaYTe — 1 BN có thể có nhiều ảnh (multi-image enrollment).
        const string sql = @"
SELECT
    MaYTe,
    MAX(HoTen)        AS HoTen,
    MAX(EnrolledAt)   AS EnrolledAt,
    COUNT(*)          AS ActiveImages
FROM dbo.PatientFaceEmbedding
WHERE RevokedAt IS NULL
GROUP BY MaYTe
ORDER BY MAX(EnrolledAt) DESC;";
        var rows = (await _db.ListAsync<EnrolledRecord>(sql)).ToList();
        return rows;
    }

    public async Task<IReadOnlyList<FaceIdentifyCandidate>> LoadCandidatesAsync(CancellationToken ct = default)
    {
        const string sql = @"
SELECT MaYTe, EmbeddingEnc, KeyId
FROM dbo.PatientFaceEmbedding
WHERE RevokedAt IS NULL;";

        var rows = await _db.ListAsync(sql);
        var list = new List<FaceIdentifyCandidate>();
        foreach (var row in rows)
        {
            var dict = (IDictionary<string, object>)row;
            var code = dict["MaYTe"] as string;
            if (string.IsNullOrWhiteSpace(code) || dict["EmbeddingEnc"] is not byte[] blob)
            {
                continue;
            }
            try
            {
                var vec = _crypto.Decrypt(blob);
                list.Add(new FaceIdentifyCandidate(code!, vec));
            }
            catch (Exception ex)
            {
                // Embedding mã hóa bằng khóa khác / đã hỏng — bỏ qua, log warning.
                _log.LogWarning(ex, "Không decrypt được embedding cho {MaYTe}", code);
            }
        }
        return list;
    }
}
