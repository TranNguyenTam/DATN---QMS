-- ════════════════════════════════════════════════════════════════
-- 30_alter_tiepnhan_emr.sql
-- Bổ sung 2 cột EMR-light cho dbo.TiepNhan:
--   LyDoKham     : Lý do bệnh nhân đến khám (free-text).
--   BacSiChiDinh : Tên BS chỉ định hoặc User_Id (chuỗi).
-- Idempotent: chỉ thêm cột nếu chưa tồn tại.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

USE QMS_DA;
GO

IF COL_LENGTH('dbo.TiepNhan', 'LyDoKham') IS NULL
BEGIN
    ALTER TABLE dbo.TiepNhan ADD LyDoKham NVARCHAR(500) NULL;
    PRINT 'Added column dbo.TiepNhan.LyDoKham';
END
ELSE
    PRINT 'Column dbo.TiepNhan.LyDoKham already exists';
GO

IF COL_LENGTH('dbo.TiepNhan', 'BacSiChiDinh') IS NULL
BEGIN
    ALTER TABLE dbo.TiepNhan ADD BacSiChiDinh NVARCHAR(200) NULL;
    PRINT 'Added column dbo.TiepNhan.BacSiChiDinh';
END
ELSE
    PRINT 'Column dbo.TiepNhan.BacSiChiDinh already exists';
GO

PRINT 'OK: 30_alter_tiepnhan_emr.sql applied';
GO
