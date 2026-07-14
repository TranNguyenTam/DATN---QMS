-- ════════════════════════════════════════════════════════════════
-- 51_seed_user_phongban.sql
-- Gán PhongBan + HangDoi cụ thể cho 5 user nghiệp vụ (Sys_Users_PhongBan).
--
-- Bổ sung cho 50_role_schema.sql — file đó chỉ gán role + permission
-- MENU (Sys_Role_Permissions), CHƯA gán phòng ban/hàng đợi cụ thể
-- → user login thấy "Chưa gán phòng ban cho Khám bệnh" vì
-- UserInfoService filter PhongBanList/HangDoiList qua bảng này.
--
-- ADMIN bypass (thấy mọi phòng) nên không cần gán.
-- TRUONG_KHOA chỉ xem Dashboard (không có queue page) nên không cần.
--
-- Mỗi user 1 phòng + 1 hàng đợi chính theo role:
--   BS001  (BAC_SI)    → PB 2 Phòng Khám 1     + HD 3 Khu Khám Bệnh
--   KTV001 (KTV_CLS)   → PB 5 Phòng Lấy Mẫu XN + HD 6 Lấy mẫu Xét Nghiệm
--   TN001  (TIEP_NHAN) → PB 1 Quầy tiếp nhận   + HD 1 Tiếp Nhận
--   THU001 (THU_NGAN)  → PB 8 Phòng Thu Viện Phí + HD 4 Thu Viện Phí
--   DUOC001(DUOC_SI)   → PB 9 Nhà Thuốc Bệnh Viện + HD 5 Nhà Thuốc
--
-- Idempotent: chỉ insert nếu chưa có cặp (User_Id, PhongBan_Id, HangDoi_Id).
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

DECLARE @Map TABLE (UserCode varchar(50), PhongBan_Id int, HangDoi_Id int);
INSERT INTO @Map VALUES
    ('BS001',   2, 3),
    ('KTV001',  5, 6),
    ('TN001',   1, 1),
    ('THU001',  8, 4),
    ('DUOC001', 9, 5);

INSERT INTO dbo.Sys_Users_PhongBan (User_Id, PhongBan_Id, HangDoi_Id)
SELECT u.User_Id, m.PhongBan_Id, m.HangDoi_Id
FROM @Map m
JOIN dbo.Sys_Users u ON u.UserCode = m.UserCode
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Sys_Users_PhongBan s
    WHERE s.User_Id = u.User_Id
      AND s.PhongBan_Id = m.PhongBan_Id
      AND s.HangDoi_Id = m.HangDoi_Id
);
PRINT 'OK: gán ' + CAST(@@ROWCOUNT AS varchar) + ' cặp phòng/hàng đợi cho user';

-- Verify
SELECT u.UserCode, u.UserName,
       PhongBan = pb.TenPhongBan, HangDoi = hd.TenHangDoi
FROM dbo.Sys_Users_PhongBan s
JOIN dbo.Sys_Users u ON s.User_Id = u.User_Id
LEFT JOIN dbo.DM_PhongBan pb ON s.PhongBan_Id = pb.PhongBan_Id
LEFT JOIN dbo.DM_HangDoi hd ON s.HangDoi_Id = hd.HangDoi_Id
WHERE u.UserCode IN ('BS001','KTV001','TN001','THU001','DUOC001')
ORDER BY u.UserCode;
GO

PRINT '════════════════════════════════════';
PRINT '   User-PhongBan-HangDoi seed done';
PRINT '════════════════════════════════════';
GO
