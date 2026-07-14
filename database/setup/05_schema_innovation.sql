-- ════════════════════════════════════════════════════════════════
-- 05_schema_innovation.sql
-- Hai điểm sáng tạo của đồ án:
--   * WaitEstimateLog      — log dự báo thời gian chờ (rule-based EWMA + ML hybrid)
--   * PatientFaceEmbedding — embedding khuôn mặt (Facenet512) mã hóa AES-256-GCM
--   * FaceAuditLog         — audit mọi truy cập sinh trắc khuôn mặt (NĐ 13/2023)
--
-- Đã có sẵn ở database/migrations/001..003, file này gộp lại để demo độc lập.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

-- ─── 1. WaitEstimateLog ─────────────────────────────────────────
-- Dataset để đánh giá MAE/RMSE/MAPE module dự báo wait time.
-- Mỗi lần /wait-estimate được gọi, chèn một dòng. Sau khi BN hoàn tất,
-- backend cập nhật ActualMinutes để tính sai số.
IF OBJECT_ID('dbo.WaitEstimateLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.WaitEstimateLog (
        Id                     BIGINT IDENTITY(1,1) PRIMARY KEY,
        HangDoi_Id             INT           NOT NULL,
        PhongBan_Id            INT           NULL,
        LoaiUuTien_Id          INT           NULL,
        QueueLen               INT           NOT NULL,
        ActiveCounters         INT           NOT NULL CONSTRAINT DF_WaitEstimateLog_ActiveCounters DEFAULT (1),
        PredictedMinutesRule   DECIMAL(6,2)  NULL,
        PredictedMinutesMl     DECIMAL(6,2)  NULL,
        MlConfidence           DECIMAL(4,3)  NULL,
        MethodUsed             NVARCHAR(32)  NOT NULL,
        ActualMinutes          DECIMAL(6,2)  NULL,
        HangDoiPhongBan_Id     INT           NULL,
        CreatedAt              DATETIME2(0)  NOT NULL CONSTRAINT DF_WaitEstimateLog_CreatedAt DEFAULT SYSUTCDATETIME(),
        CompletedAt            DATETIME2(0)  NULL,
        CreatedBy              INT           NULL
    );

    CREATE INDEX IX_WaitEstimateLog_HangDoi ON dbo.WaitEstimateLog (HangDoi_Id, CreatedAt DESC);
    CREATE INDEX IX_WaitEstimateLog_Pending ON dbo.WaitEstimateLog (CompletedAt) WHERE CompletedAt IS NULL;
END;
GO

-- ─── 2. PatientFaceEmbedding ────────────────────────────────────
-- Vector 512-dim Facenet512, mã hóa AES-256-GCM(nonce(12) || ciphertext || tag(16)).
-- KHÔNG lưu ảnh gốc. Multi-image: tối đa 5 active/BN — vượt thì revoke cũ nhất.
IF OBJECT_ID('dbo.PatientFaceEmbedding', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PatientFaceEmbedding (
        Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
        MaYTe         NVARCHAR(64)    NOT NULL,
        HoTen         NVARCHAR(200)   NULL,
        ModelName     NVARCHAR(64)    NOT NULL CONSTRAINT DF_PatientFaceEmbedding_ModelName DEFAULT N'Facenet512',
        EmbeddingEnc  VARBINARY(4000) NOT NULL,
        KeyId         NVARCHAR(64)    NOT NULL,
        EnrolledAt    DATETIME2(0)    NOT NULL CONSTRAINT DF_PatientFaceEmbedding_EnrolledAt DEFAULT SYSUTCDATETIME(),
        EnrolledBy    INT             NULL,
        RevokedAt     DATETIME2(0)    NULL,
        RevokedBy     INT             NULL
    );

    CREATE INDEX IX_PatientFaceEmbedding_MaYTe
        ON dbo.PatientFaceEmbedding (MaYTe)
        WHERE RevokedAt IS NULL;
END;
GO

-- ─── 3. FaceAuditLog ────────────────────────────────────────────
-- Audit mọi hành vi Enroll/Identify/Revoke/View/Delete embedding.
IF OBJECT_ID('dbo.FaceAuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FaceAuditLog (
        Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
        Action      NVARCHAR(32)  NOT NULL,
        MaYTe       NVARCHAR(64)  NULL,
        UserId      INT           NULL,
        Result      NVARCHAR(16)  NOT NULL,
        Confidence  DECIMAL(5,4)  NULL,
        Message     NVARCHAR(500) NULL,
        ClientIp    NVARCHAR(64)  NULL,
        UserAgent   NVARCHAR(500) NULL,
        CreatedAt   DATETIME2(0)  NOT NULL CONSTRAINT DF_FaceAuditLog_CreatedAt DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_FaceAuditLog_MaYTe_CreatedAt ON dbo.FaceAuditLog (MaYTe, CreatedAt DESC);
    CREATE INDEX IX_FaceAuditLog_User_CreatedAt  ON dbo.FaceAuditLog (UserId, CreatedAt DESC);
END;
GO

PRINT 'OK: 05_schema_innovation.sql applied';
GO
