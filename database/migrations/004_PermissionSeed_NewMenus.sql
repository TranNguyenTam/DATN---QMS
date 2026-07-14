-- 004_PermissionSeed_NewMenus.sql
-- Thêm các MenuCode mới (cho route web bổ sung) vào bảng Menu + cấp quyền
-- ngay cho ADMIN. Các user khác do màn "Phân quyền Menu" cấp tay.
--
-- Idempotent: chỉ insert nếu MenuCode chưa tồn tại.

DECLARE @AdminId int;
SELECT @AdminId = User_Id FROM Sys_Users WHERE UserCode = N'ADMIN';

-- Danh sách menu mới cần seed.
DECLARE @NewMenus TABLE (MenuCode nvarchar(50), MenuName nvarchar(200), ParentCode nvarchar(50));

INSERT INTO @NewMenus VALUES
    -- Hệ thống ▸ Đăng ký khuôn mặt
    (N'barButtonItem37',          N'Đăng ký khuôn mặt',     N'ribbonPage5'),
    -- Dashboard
    (N'ribbonPageDashboard',      N'Dashboard',             NULL),
    (N'barButtonDashboardKpi',    N'KPI vận hành',          N'ribbonPageDashboard'),
    (N'barButtonWaitTimeMetrics', N'Đo lường dự báo',       N'ribbonPageDashboard');

-- 1. Insert menu mới (nếu chưa có).
INSERT INTO Menu (MenuCode, MenuName, ParentMenu, TamNgung, NgayTao, NguoiTao, Huy)
SELECT
    n.MenuCode,
    n.MenuName,
    p.Menu_Id,
    0,
    SYSUTCDATETIME(),
    @AdminId,
    0
FROM @NewMenus n
LEFT JOIN Menu p ON p.MenuCode = n.ParentCode AND p.Huy = 0
WHERE NOT EXISTS (SELECT 1 FROM Menu m WHERE m.MenuCode = n.MenuCode AND m.Huy = 0);

-- 2. Cấp quyền cho ADMIN (nếu chưa).
INSERT INTO Permission (User_Id, Menu_Id)
SELECT @AdminId, m.Menu_Id
FROM Menu m
INNER JOIN @NewMenus n ON m.MenuCode = n.MenuCode
WHERE m.Huy = 0
  AND NOT EXISTS (
      SELECT 1 FROM Permission p WHERE p.User_Id = @AdminId AND p.Menu_Id = m.Menu_Id
  );

PRINT N'Đã seed menu + cấp quyền ADMIN cho các route web mới.';
