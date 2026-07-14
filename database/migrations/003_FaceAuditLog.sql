-- 003_FaceAuditLog.sql
-- Audit log mọi hành vi truy cập dữ liệu sinh trắc khuôn mặt.
-- Yêu cầu từ đề cương (mục "Bảo mật dữ liệu khuôn mặt") + Nghị định 13/2023.

IF OBJECT_ID('dbo.FaceAuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FaceAuditLog (
        Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
        Action      NVARCHAR(32)  NOT NULL, -- 'ENROLL' | 'IDENTIFY' | 'REVOKE' | 'VIEW' | 'DELETE'
        MaYTe       NVARCHAR(64)  NULL,
        UserId      INT           NULL,
        Result      NVARCHAR(16)  NOT NULL, -- 'SUCCESS' | 'FAIL' | 'DENIED'
        Confidence  DECIMAL(5,4)  NULL,
        Message     NVARCHAR(500) NULL,
        ClientIp    NVARCHAR(64)  NULL,
        UserAgent   NVARCHAR(500) NULL,
        CreatedAt   DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_FaceAuditLog_MaYTe_CreatedAt
        ON dbo.FaceAuditLog (MaYTe, CreatedAt DESC);
    CREATE INDEX IX_FaceAuditLog_User_CreatedAt
        ON dbo.FaceAuditLog (UserId, CreatedAt DESC);
END;
GO
