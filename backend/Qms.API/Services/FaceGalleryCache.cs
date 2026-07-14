namespace Qms.API.Services;

/// <summary>
/// Kết quả so khớp 1:N tại backend (C#).
/// </summary>
public record FaceMatchResult(
    bool Recognized,
    string? PatientCode,
    double BestScore,
    double SecondScore,
    double Margin,
    double Threshold,
    int GallerySize);

/// <summary>
/// Cache gallery embedding đã giải mã trong RAM + so khớp cosine NGAY TẠI backend.
///
/// Lý do tồn tại: trước đây mỗi lần check-in backend SELECT toàn bộ
/// PatientFaceEmbedding, giải mã AES-GCM từng row, rồi serialize toàn bộ vector
/// gửi qua HTTP/JSON cho service Python quét cosine — O(N) + payload khổng lồ +
/// lộ template sinh trắc plaintext mỗi request. Cache này:
///   - Giải mã gallery 1 lần, giữ trong process tin cậy (không xuất qua mạng).
///   - So cosine = dot product (vector đã L2-normalize) ngay tại C#.
///   - Áp ngưỡng + margin top-1 vs top-2 (khác BN) → chống nhận nhầm khi N lớn.
///   - Invalidate khi Enroll/Revoke (FaceEnrollmentService gọi Invalidate()).
///
/// Singleton → dùng IServiceScopeFactory để mượn IFaceEnrollmentService (Scoped)
/// lúc nạp gallery.
/// </summary>
public interface IFaceGalleryCache
{
    Task<FaceMatchResult> MatchAsync(float[] probe, CancellationToken ct = default);
    Task<int> CountAsync(CancellationToken ct = default);
    void Invalidate();
}

public class FaceGalleryCache : IFaceGalleryCache
{
    // Mỗi BN giữ nhiều embedding (multi-image). best-of-BN = max cosine trong nhóm.
    private sealed class PatientEntry
    {
        public required string Code { get; init; }
        public required float[][] Vectors { get; init; }
    }

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FaceGalleryCache> _log;
    private readonly double _threshold;
    private readonly double _margin;

    private readonly SemaphoreSlim _gate = new(1, 1);
    private volatile PatientEntry[] _entries = Array.Empty<PatientEntry>();
    private long _version;            // tăng mỗi lần enroll/revoke
    private long _loadedVersion = -1; // version đang nằm trong _entries

    public FaceGalleryCache(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<FaceGalleryCache> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
        _threshold = config.GetValue<double?>("Face:CosineThreshold") ?? 0.62;
        _margin = config.GetValue<double?>("Face:Margin") ?? 0.06;
    }

    public void Invalidate() => Interlocked.Increment(ref _version);

    public async Task<int> CountAsync(CancellationToken ct = default)
    {
        await EnsureLoadedAsync(ct);
        return _entries.Sum(e => e.Vectors.Length);
    }

    public async Task<FaceMatchResult> MatchAsync(float[] probe, CancellationToken ct = default)
    {
        await EnsureLoadedAsync(ct);

        var entries = _entries;               // snapshot reference (atomic swap)
        if (entries.Length == 0)
            return new FaceMatchResult(false, null, 0, 0, _margin, _threshold, 0);

        var q = NormalizedCopy(probe);

        string? bestCode = null;
        double bestScore = double.NegativeInfinity;
        double secondScore = double.NegativeInfinity; // best của BN khác bestCode

        foreach (var e in entries)
        {
            // best cosine trong các ảnh của BN này
            double patientBest = double.NegativeInfinity;
            foreach (var v in e.Vectors)
            {
                if (v.Length != q.Length) continue;
                double dot = 0;
                for (int i = 0; i < v.Length; i++) dot += v[i] * q[i];
                if (dot > patientBest) patientBest = dot;
            }

            if (patientBest > bestScore)
            {
                secondScore = bestScore;       // BN cũ tụt xuống hạng 2 (khác code mới)
                bestScore = patientBest;
                bestCode = e.Code;
            }
            else if (patientBest > secondScore)
            {
                secondScore = patientBest;
            }
        }

        double best = double.IsNegativeInfinity(bestScore) ? 0 : bestScore;
        double second = double.IsNegativeInfinity(secondScore) ? 0 : secondScore;
        bool recognized = best >= _threshold && (best - second) >= _margin;

        return new FaceMatchResult(
            recognized,
            recognized ? bestCode : null,
            Math.Round(best, 4),
            Math.Round(second, 4),
            _margin,
            _threshold,
            entries.Length);
    }

    private async Task EnsureLoadedAsync(CancellationToken ct)
    {
        if (Interlocked.Read(ref _loadedVersion) == Interlocked.Read(ref _version))
            return;

        await _gate.WaitAsync(ct);
        try
        {
            long target = Interlocked.Read(ref _version);
            if (Interlocked.Read(ref _loadedVersion) == target)
                return; // thread khác vừa nạp xong

            using var scope = _scopeFactory.CreateScope();
            var enroll = scope.ServiceProvider.GetRequiredService<IFaceEnrollmentService>();
            var candidates = await enroll.LoadCandidatesAsync(ct);

            var entries = candidates
                .Where(c => c.Embedding is { Length: > 0 } && !string.IsNullOrWhiteSpace(c.PatientCode))
                .GroupBy(c => c.PatientCode)
                .Select(g => new PatientEntry
                {
                    Code = g.Key,
                    Vectors = g.Select(c => NormalizedCopy(c.Embedding)).ToArray(),
                })
                .ToArray();

            _entries = entries;
            Interlocked.Exchange(ref _loadedVersion, target);
            _log.LogInformation(
                "FaceGalleryCache nạp lại: {Patients} BN / {Vectors} embedding (threshold={Thr}, margin={Mar})",
                entries.Length, candidates.Count, _threshold, _margin);
        }
        finally
        {
            _gate.Release();
        }
    }

    private static float[] NormalizedCopy(float[] v)
    {
        double sum = 0;
        for (int i = 0; i < v.Length; i++) sum += (double)v[i] * v[i];
        float norm = (float)Math.Sqrt(sum) + 1e-9f;
        var outv = new float[v.Length];
        for (int i = 0; i < v.Length; i++) outv[i] = v[i] / norm;
        return outv;
    }
}
