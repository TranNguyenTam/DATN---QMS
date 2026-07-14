-- 002_PatientFaceEmbedding.sql
-- Lưu embedding khuôn mặt (vector 512-dim, Facenet512) đã mã hóa AES-256-GCM.
-- KHÔNG LƯU ảnh gốc lâu dài (mục "Bảo mật dữ liệu khuôn mặt" trong đề cương).
--
-- Embedding: 512 float32 = 2048 bytes plaintext. Sau mã hóa + nonce(12) + tag(16)
-- ~ 2076 bytes → VARBINARY(4000) đủ dư.

-- Filtered index (WHERE RevokedAt IS NULL) cần các ANSI options bật.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.PatientFaceEmbedding', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PatientFaceEmbedding (
        Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
        MaYTe         NVARCHAR(64)   NOT NULL,
        HoTen         NVARCHAR(200)  NULL,
        ModelName     NVARCHAR(64)   NOT NULL DEFAULT 'Facenet512',
        EmbeddingEnc  VARBINARY(4000) NOT NULL,  -- AES-256-GCM(nonce(12) || ciphertext || tag(16))
        KeyId         NVARCHAR(64)   NOT NULL,    -- để xoay khóa không phải decrypt lại
        EnrolledAt    DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME(),
        EnrolledBy    INT            NULL,
        RevokedAt     DATETIME2(0)   NULL,
        RevokedBy     INT            NULL
    );

    CREATE INDEX IX_PatientFaceEmbedding_MaYTe
        ON dbo.PatientFaceEmbedding (MaYTe)
        WHERE RevokedAt IS NULL;
END;
GO
