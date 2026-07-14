-- 001_WaitEstimateLog.sql
-- Dataset phục vụ đánh giá MAE/RMSE/MAPE cho module dự báo thời gian chờ.
-- Mỗi lần /wait-estimate được gọi, chèn một dòng. Sau khi bệnh nhân hoàn tất,
-- backend cập nhật actualMinutes để tính sai số.

-- Filtered index (WHERE CompletedAt IS NULL) cần ANSI options này bật.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.WaitEstimateLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.WaitEstimateLog (
        Id                BIGINT IDENTITY(1,1) PRIMARY KEY,
        HangDoi_Id        INT           NOT NULL,
        PhongBan_Id       INT           NULL,
        LoaiUuTien_Id     INT           NULL,
        QueueLen          INT           NOT NULL,
        ActiveCounters    INT           NOT NULL DEFAULT 1,
        PredictedMinutesRule   DECIMAL(6,2) NULL,
        PredictedMinutesMl     DECIMAL(6,2) NULL,
        MlConfidence           DECIMAL(4,3) NULL,
        MethodUsed             NVARCHAR(32) NOT NULL, -- 'rule-ewma' | 'ml-rf' | 'ml-xgb' | 'hybrid-fallback'
        ActualMinutes          DECIMAL(6,2) NULL,
        HangDoiPhongBan_Id     INT           NULL,
        CreatedAt              DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CompletedAt            DATETIME2(0) NULL,
        CreatedBy              INT           NULL
    );

    CREATE INDEX IX_WaitEstimateLog_HangDoi ON dbo.WaitEstimateLog (HangDoi_Id, CreatedAt DESC);
    CREATE INDEX IX_WaitEstimateLog_Pending ON dbo.WaitEstimateLog (CompletedAt) WHERE CompletedAt IS NULL;
END;
GO
