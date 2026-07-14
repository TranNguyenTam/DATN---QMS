using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

public enum FaceAuditAction { Enroll, Identify, Revoke, View, Delete, Manual }
public enum FaceAuditResult { Success, Fail, Denied }

/// <summary>
/// Ghi audit mọi hành vi truy cập dữ liệu sinh trắc khuôn mặt vào bảng
/// FaceAuditLog — theo yêu cầu mục "Bảo mật dữ liệu khuôn mặt" của đề cương
/// và Nghị định 13/2023.
/// </summary>
public interface IFaceAuditService
{
    Task WriteAsync(
        FaceAuditAction action,
        FaceAuditResult result,
        string? maYTe = null,
        int? userId = null,
        double? confidence = null,
        string? message = null,
        string? clientIp = null,
        string? userAgent = null,
        CancellationToken ct = default);
}

public class FaceAuditService : IFaceAuditService
{
    private readonly IDatabaseHelper _db;
    private readonly ILogger<FaceAuditService> _log;

    public FaceAuditService(IDatabaseHelper db, ILogger<FaceAuditService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task WriteAsync(
        FaceAuditAction action,
        FaceAuditResult result,
        string? maYTe = null,
        int? userId = null,
        double? confidence = null,
        string? message = null,
        string? clientIp = null,
        string? userAgent = null,
        CancellationToken ct = default)
    {
        // CreatedAt ghi giờ ĐỊA PHƯƠNG (SYSDATETIME) cho khớp phần còn lại của QMS
        // — tránh hiển thị lệch UTC+7 trên FE.
        const string sql = @"
INSERT INTO dbo.FaceAuditLog (Action, MaYTe, UserId, Result, Confidence, Message, ClientIp, UserAgent, CreatedAt)
VALUES (@Action, @MaYTe, @UserId, @Result, @Confidence, @Message, @ClientIp, @UserAgent, SYSDATETIME());";

        try
        {
            await _db.ExecuteAsync(sql, new
            {
                Action = action.ToString().ToUpperInvariant(),
                MaYTe = maYTe,
                UserId = userId,
                Result = result.ToString().ToUpperInvariant(),
                Confidence = confidence,
                Message = Truncate(message, 500),
                ClientIp = Truncate(clientIp, 64),
                UserAgent = Truncate(userAgent, 500),
            });
        }
        catch (Exception ex)
        {
            // Không fail request nếu audit log gặp lỗi (log error thay vì throw).
            _log.LogError(ex, "FaceAuditLog insert failed action={Action} maYTe={MaYTe}", action, maYTe);
        }
    }

    private static string? Truncate(string? s, int max)
        => string.IsNullOrEmpty(s) ? s : (s!.Length <= max ? s : s.Substring(0, max));
}
