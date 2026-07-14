-- 44_push_subscription.sql — bảng lưu Web Push subscription cho cổng theo dõi BN.
-- Idempotent. Track theo 1 bước (HangDoiPhongBan_Id) HOẶC cả hành trình (BenhNhan_Id).
-- Stage = máy trạng thái: pending → prewarn (sắp tới ~N người) → called (đến lượt)
--   → skipped (quá lượt, xếp số mới). LastStt/LastHangDoiId phát hiện đổi số (qua lượt)
--   và đổi hàng đợi (chuyển khám→CLS→viện phí...) để nhắc đúng lúc, không báo 1 lần rồi thôi.
IF OBJECT_ID('dbo.PushSubscription', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PushSubscription (
        Id                  INT IDENTITY(1,1) PRIMARY KEY,
        Endpoint            NVARCHAR(500)  NOT NULL,
        P256dh              NVARCHAR(200)  NOT NULL,
        Auth                NVARCHAR(100)  NOT NULL,
        HangDoiPhongBan_Id  INT            NOT NULL CONSTRAINT DF_PushSub_Hd DEFAULT (0),
        BenhNhan_Id         INT            NOT NULL CONSTRAINT DF_PushSub_Bn DEFAULT (0),
        Active              BIT            NOT NULL CONSTRAINT DF_PushSub_Active DEFAULT (1),
        Stage               NVARCHAR(20)   NULL,
        LastStt             INT            NULL,
        LastHangDoiId       INT            NULL,
        CreatedAt           DATETIME       NOT NULL CONSTRAINT DF_PushSub_CreatedAt DEFAULT (GETDATE()),
        UpdatedAt           DATETIME       NULL
    );
    CREATE UNIQUE INDEX UX_PushSub_Target
        ON dbo.PushSubscription (Endpoint, HangDoiPhongBan_Id, BenhNhan_Id);
    CREATE INDEX IX_PushSub_Active
        ON dbo.PushSubscription (Active)
        INCLUDE (HangDoiPhongBan_Id, BenhNhan_Id, Stage, LastStt, LastHangDoiId);
    PRINT 'Created dbo.PushSubscription';
END
ELSE
    PRINT 'dbo.PushSubscription already exists';
