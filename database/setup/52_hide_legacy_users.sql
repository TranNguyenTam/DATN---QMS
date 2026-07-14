-- ════════════════════════════════════════════════════════════════
-- 52_hide_legacy_users.sql
-- Ẩn (soft-delete Huy=1) 20 user legacy clone từ HIS công ty —
-- trùng chức năng với 6 user RBAC mới, chưa gán role, không có data
-- nghiệp vụ gắn vào. Rollback bằng UPDATE Huy=0.
--
-- GIỮ LẠI (không ẩn):
--   - ADMIN                              (toàn quyền)
--   - 6 RBAC: BS001/KTV001/TN001/THU001/DUOC001/TRUONG001
--   - 7 device: tivi*/kios/userver/amthanh* (Tivi/Kiosk/Loa login)
--
-- Idempotent: chỉ update user chưa ẩn + không thuộc 2 nhóm giữ lại.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

-- Danh sách user GIỮ LẠI (không ẩn)
DECLARE @Keep TABLE (UserCode varchar(50));
INSERT INTO @Keep VALUES
    ('ADMIN'),
    ('BS001'), ('KTV001'), ('TN001'), ('THU001'), ('DUOC001'), ('TRUONG001');

-- Device user: pattern tivi* / kios* / *server / amthanh*
-- (giữ nguyên, không gán role — Tivi/Kiosk dùng route riêng)

PRINT '=== User SẼ bị ẩn ===';
SELECT UserCode, UserName FROM Sys_Users
WHERE ISNULL(Huy, 0) = 0
  AND UserCode NOT IN (SELECT UserCode FROM @Keep)
  AND UserCode NOT LIKE 'tivi%'
  AND UserCode NOT LIKE 'kios%'
  AND UserCode NOT LIKE '%server'
  AND UserCode NOT LIKE 'amthanh%'
ORDER BY UserCode;

UPDATE Sys_Users
SET Huy = 1, NgayCapNhat = GETDATE()
WHERE ISNULL(Huy, 0) = 0
  AND UserCode NOT IN (SELECT UserCode FROM @Keep)
  AND UserCode NOT LIKE 'tivi%'
  AND UserCode NOT LIKE 'kios%'
  AND UserCode NOT LIKE '%server'
  AND UserCode NOT LIKE 'amthanh%';

PRINT 'OK: ẩn ' + CAST(@@ROWCOUNT AS varchar) + ' user legacy';

-- Tóm tắt còn lại
PRINT '=== User còn hoạt động sau khi ẩn ===';
SELECT Nhom = CASE
    WHEN UserCode = 'ADMIN' THEN '1-Admin'
    WHEN UserCode IN ('BS001','KTV001','TN001','THU001','DUOC001','TRUONG001') THEN '2-RBAC'
    ELSE '3-Device'
  END,
  UserCode, UserName
FROM Sys_Users WHERE ISNULL(Huy,0) = 0
ORDER BY 1, UserCode;
GO

PRINT '════════════════════════════════════';
PRINT '   Hide legacy users done';
PRINT '════════════════════════════════════';
GO
