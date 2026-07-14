-- ════════════════════════════════════════════════════════════════
-- 53_reseed_role_permissions.sql
-- RE-SEED Sys_Role_Permissions với permissionKey ĐÚNG theo menuConfig.js
-- hiện tại (sau nhiều lần refactor menu).
--
-- BUG: 50_role_schema.sql seed key giả định (barButtonItem11/12/13/14,
-- ribbonPageGroup7/8) KHÔNG khớp menuConfig.js thực tế → user có role
-- nhưng permission trỏ menu không tồn tại → "Không có quyền truy cập
-- menu nào" (vd DUOC001).
--
-- Key đúng (trích từ menuConfig.js):
--   Tiếp Nhận:   ribbonPage1, ribbonPageGroup3, ribbonPageGroup1,
--                barButtonItem2, barButtonItemDangKyDayDu,
--                barButtonItem1, barButtonItem3
--   Khám bệnh:   ribbonPage2, ribbonPageGroup2, barButtonItem4,
--                barButtonBenhAnChiDinh, barButtonItem5, barButtonItem28
--   CLS:         ribbonPage3, ribbonPageGroup4/5/12, barButtonItem6/7/8/9/10/27
--   Viện phí:    ribbonPage6, ribbonPageGroup10, barButtonItem23/24
--   Nhà thuốc:   ribbonPage7, ribbonPageGroup11, barButtonItem25/26
--   Dashboard:   ribbonPageDashboard, barButtonDashboardKpi, barButtonWaitTimeMetrics
--
-- Idempotent: DELETE toàn bộ permission của 6 role (trừ ADMIN) rồi
-- INSERT lại theo map đúng.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

-- Xoá permission cũ của 6 role nghiệp vụ (ADMIN bypass nên không seed)
DELETE rp FROM dbo.Sys_Role_Permissions rp
JOIN dbo.Sys_Roles r ON rp.Role_Id = r.Role_Id
WHERE r.RoleCode IN ('TIEP_NHAN','BAC_SI','KTV_CLS','THU_NGAN','DUOC_SI','TRUONG_KHOA');

DECLARE @P TABLE (RoleCode varchar(30), PermKey varchar(80));

-- TIEP_NHAN — Tiếp Nhận group + Hồ sơ bệnh nhân + Kiosk group
INSERT INTO @P VALUES
    ('TIEP_NHAN', 'ribbonPage1'),
    ('TIEP_NHAN', 'ribbonPageGroup3'),
    ('TIEP_NHAN', 'barButtonItem2'),
    ('TIEP_NHAN', 'barButtonItemDangKyDayDu'),
    -- Hồ sơ bệnh nhân (chuyển từ Hệ thống về Tiếp nhận): Quản lý BN + Đăng ký khuôn mặt
    ('TIEP_NHAN', 'ribbonPageGroupHoSoBN'),
    ('TIEP_NHAN', 'barButtonItem36'),
    ('TIEP_NHAN', 'barButtonItem37'),
    ('TIEP_NHAN', 'ribbonPageGroup1'),
    ('TIEP_NHAN', 'barButtonItem1'),
    ('TIEP_NHAN', 'barButtonItem3');

-- BAC_SI — Khám bệnh
INSERT INTO @P VALUES
    ('BAC_SI', 'ribbonPage2'),
    ('BAC_SI', 'ribbonPageGroup2'),
    ('BAC_SI', 'barButtonItem4'),
    ('BAC_SI', 'barButtonBenhAnChiDinh'),
    ('BAC_SI', 'barButtonLichSuKhamBenh'),
    ('BAC_SI', 'barButtonItem5');

-- KTV_CLS — Cận lâm sàng (Xét nghiệm + CDHA)
-- Bỏ ribbonPageGroup12/barButtonItem27 (Nội trú) + barButtonItem8 (Nhận bệnh CDHA)
-- vì các menu này ĐÃ GỠ khỏi menuConfig.js → quyền chết, không hiện gì.
INSERT INTO @P VALUES
    ('KTV_CLS', 'ribbonPage3'),
    ('KTV_CLS', 'ribbonPageGroup4'),
    ('KTV_CLS', 'barButtonItem6'),
    ('KTV_CLS', 'barButtonItem7'),
    ('KTV_CLS', 'ribbonPageGroup5'),
    ('KTV_CLS', 'barButtonItem9'),
    ('KTV_CLS', 'barButtonItem10');

-- THU_NGAN — Viện phí
INSERT INTO @P VALUES
    ('THU_NGAN', 'ribbonPage6'),
    ('THU_NGAN', 'ribbonPageGroup10'),
    ('THU_NGAN', 'barButtonItem23'),
    ('THU_NGAN', 'barButtonItem24');

-- DUOC_SI — Nhà thuốc
INSERT INTO @P VALUES
    ('DUOC_SI', 'ribbonPage7'),
    ('DUOC_SI', 'ribbonPageGroup11'),
    ('DUOC_SI', 'barButtonItem25'),
    ('DUOC_SI', 'barButtonItem26');

-- TRUONG_KHOA — Dashboard (toàn bộ: KPI + Phân tích vận hành + Đo lường dự báo)
INSERT INTO @P VALUES
    ('TRUONG_KHOA', 'ribbonPageDashboard'),
    ('TRUONG_KHOA', 'barButtonDashboardKpi'),
    ('TRUONG_KHOA', 'barButtonPhanTichVanHanh'),
    ('TRUONG_KHOA', 'barButtonWaitTimeMetrics');

INSERT INTO dbo.Sys_Role_Permissions (Role_Id, PermissionKey)
SELECT r.Role_Id, p.PermKey
FROM @P p
JOIN dbo.Sys_Roles r ON r.RoleCode = p.RoleCode;
PRINT 'OK: re-seed ' + CAST(@@ROWCOUNT AS varchar) + ' permission (key đúng menuConfig)';

-- Verify
SELECT r.RoleCode, SoPerm = COUNT(rp.PermissionKey)
FROM dbo.Sys_Roles r
LEFT JOIN dbo.Sys_Role_Permissions rp ON r.Role_Id = rp.Role_Id
GROUP BY r.RoleCode ORDER BY r.RoleCode;
GO

PRINT '════════════════════════════════════';
PRINT '   Re-seed role permissions done';
PRINT '════════════════════════════════════';
GO
