-- ════════════════════════════════════════════════════════════════
-- 50_role_schema.sql
-- Phân quyền RBAC cho QMS — 3 bảng + seed 7 role + 7 user mẫu.
--
--   Sys_Roles                 RoleCode + RoleName + Description
--   Sys_User_Roles            ánh xạ User → Role (n-n)
--   Sys_Role_Permissions      ánh xạ Role → permissionKey trong menuConfig.js
--                              (FE filter menu + backend check Authorize)
--
-- 7 role chuẩn theo nghiệp vụ bệnh viện YHCT:
--   ADMIN         toàn quyền (giữ bypass cũ)
--   TIEP_NHAN     lễ tân quầy + kiosk
--   BAC_SI        gọi BN khám + ghi bệnh án + chỉ định + kê đơn
--   KTV_CLS       quản lý hàng đợi XN + CDHA + check-in CLS nội trú
--   THU_NGAN      thu ngân viện phí
--   DUOC_SI       dược sĩ nhà thuốc
--   TRUONG_KHOA   xem dashboard (read-only)
--
-- Idempotent: IF NOT EXISTS + INSERT WHERE NOT EXISTS.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

-- ── A. Bảng Sys_Roles ─────────────────────────────────────────

IF OBJECT_ID('dbo.Sys_Roles') IS NULL
BEGIN
    CREATE TABLE dbo.Sys_Roles (
        Role_Id       int           IDENTITY(1,1) PRIMARY KEY,
        RoleCode      varchar(30)   NOT NULL UNIQUE,
        RoleName      nvarchar(100) NOT NULL,
        Description   nvarchar(500) NULL,
        TamNgung      bit           DEFAULT 0,
        NgayTao       datetime      DEFAULT GETDATE()
    );
    PRINT 'OK: Sys_Roles created';
END
GO

-- ── B. Bảng Sys_User_Roles (n-n) ───────────────────────────────

IF OBJECT_ID('dbo.Sys_User_Roles') IS NULL
BEGIN
    CREATE TABLE dbo.Sys_User_Roles (
        User_Id   int       NOT NULL,
        Role_Id   int       NOT NULL,
        NgayGan   datetime  DEFAULT GETDATE(),
        NguoiGan  int       NULL,
        PRIMARY KEY (User_Id, Role_Id)
    );
    CREATE INDEX IX_SUR_User ON dbo.Sys_User_Roles(User_Id);
    CREATE INDEX IX_SUR_Role ON dbo.Sys_User_Roles(Role_Id);
    PRINT 'OK: Sys_User_Roles created';
END
GO

-- ── C. Bảng Sys_Role_Permissions ──────────────────────────────
-- Role có quyền truy cập 1 menu key (khớp menuConfig.js — vd
-- 'barButtonItem4' = "Quản lý hàng đợi khám", 'barButtonBenhAnChiDinh'
-- = "Bệnh án + Chỉ định"). FE filter hiển thị menu theo permission;
-- BE Authorize cũng check trên permissionKey hoặc role claim.

IF OBJECT_ID('dbo.Sys_Role_Permissions') IS NULL
BEGIN
    CREATE TABLE dbo.Sys_Role_Permissions (
        Role_Id        int           NOT NULL,
        PermissionKey  varchar(80)   NOT NULL,
        NgayGan        datetime      DEFAULT GETDATE(),
        NguoiGan       int           NULL,
        PRIMARY KEY (Role_Id, PermissionKey)
    );
    CREATE INDEX IX_SRP_Role ON dbo.Sys_Role_Permissions(Role_Id);
    PRINT 'OK: Sys_Role_Permissions created';
END
GO

-- ── D. Seed 7 role chuẩn ──────────────────────────────────────

DECLARE @Roles TABLE (Code varchar(30), Name nvarchar(100), Desc_ nvarchar(500));
INSERT INTO @Roles VALUES
    ('ADMIN',       N'Quản trị viên',
        N'Toàn quyền hệ thống — bypass mọi check (giữ tương thích logic ADMIN cũ).'),
    ('TIEP_NHAN',   N'Tiếp nhận / Lễ tân',
        N'Vận hành quầy tiếp nhận, kiosk đăng ký, đăng ký đầy đủ và Tivi tiếp nhận.'),
    ('BAC_SI',      N'Bác sĩ',
        N'Quản lý hàng đợi Khám bệnh, ghi bệnh án + chỉ định CLS + kê đơn thuốc.'),
    ('KTV_CLS',     N'KTV Cận lâm sàng',
        N'Quản lý hàng đợi XN, CDHA, check-in CLS nội trú và Tivi CLS.'),
    ('THU_NGAN',    N'Thu ngân viện phí',
        N'Quản lý hàng đợi Viện phí, gọi BN và Tivi Viện phí.'),
    ('DUOC_SI',     N'Dược sĩ nhà thuốc',
        N'Quản lý hàng đợi Nhà thuốc, gọi BN phát thuốc và Tivi Nhà thuốc.'),
    ('TRUONG_KHOA', N'Trưởng khoa / BGĐ',
        N'Xem Dashboard KPI vận hành + Đo lường ML dự báo. Read-only.');

INSERT INTO dbo.Sys_Roles (RoleCode, RoleName, Description)
SELECT r.Code, r.Name, r.Desc_
FROM @Roles r
WHERE NOT EXISTS (SELECT 1 FROM dbo.Sys_Roles s WHERE s.RoleCode = r.Code);
PRINT 'OK: seed ' + CAST(@@ROWCOUNT AS varchar) + ' role mới';

-- ── E. Seed 6 user mẫu (đã có ADMIN) ─────────────────────────
-- Password seeded = '123' (cùng convention ADMIN). CryptUtil sẽ XOR
-- encode khi user login đầu tiên (không cần preset hash).

DECLARE @SeedUsers TABLE (Code varchar(50), Name nvarchar(200), RoleCode varchar(30));
INSERT INTO @SeedUsers VALUES
    ('BS001',     N'BS. Trần Nguyên Tâm',      'BAC_SI'),
    ('KTV001',    N'KTV. Phạm Thị Lan',         'KTV_CLS'),
    ('TN001',     N'Lê Thị Tiếp Tân',           'TIEP_NHAN'),
    ('THU001',    N'Nguyễn Văn Thu',            'THU_NGAN'),
    ('DUOC001',   N'DS. Hoàng Thị Dược',        'DUOC_SI'),
    ('TRUONG001', N'TS. Đỗ Văn Trưởng Khoa',    'TRUONG_KHOA');

DECLARE @code varchar(50), @name nvarchar(200), @roleCode varchar(30);
DECLARE @userId int, @roleId int;

-- Sửa state xấu nếu re-run sau bug cursor cũ
DELETE ur FROM dbo.Sys_User_Roles ur
JOIN dbo.Sys_Users u ON ur.User_Id = u.User_Id
WHERE u.UserCode IN ('BS001','KTV001','TN001','THU001','DUOC001','TRUONG001');

DECLARE cur CURSOR FOR SELECT Code, Name, RoleCode FROM @SeedUsers;
OPEN cur;
FETCH NEXT FROM cur INTO @code, @name, @roleCode;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @userId = NULL;
    SET @roleId = NULL;

    -- Insert user nếu chưa có (SELECT có thể không gán nếu không match → reset trước)
    SELECT @userId = User_Id FROM dbo.Sys_Users WHERE UserCode = @code;
    IF @userId IS NULL
    BEGIN
        -- Password "123" sau CryptUtil.EncryptPassword: 2 prefix chars
        -- (SYN U+0016, SOH U+0001) + payload "&&&". Phải lưu đúng 5 ký tự
        -- nếu không AuthService.DecryptPassword sẽ trả sai → login fail 401.
        INSERT INTO dbo.Sys_Users (UserCode, UserName, Password, BenhVien_Id,
                                   TamNgung, Huy, NgayTao, NguoiTao)
        VALUES (@code, @name,
                NCHAR(22) + NCHAR(1) + N'&&&',
                48017, 0, 0, GETDATE(), 1);
        SET @userId = SCOPE_IDENTITY();
        PRINT 'OK: tạo user ' + @code + ' (Id=' + CAST(@userId AS varchar) + ')';
    END
    ELSE
    BEGIN
        -- Fix password cũ (do bug seed lần trước lưu plaintext "123")
        UPDATE dbo.Sys_Users
        SET Password = NCHAR(22) + NCHAR(1) + N'&&&'
        WHERE User_Id = @userId AND LEN(Password) <> 5;
    END

    -- Gán role
    SELECT @roleId = Role_Id FROM dbo.Sys_Roles WHERE RoleCode = @roleCode;
    IF @userId IS NOT NULL AND @roleId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM dbo.Sys_User_Roles WHERE User_Id = @userId AND Role_Id = @roleId)
    BEGIN
        INSERT INTO dbo.Sys_User_Roles (User_Id, Role_Id) VALUES (@userId, @roleId);
    END

    FETCH NEXT FROM cur INTO @code, @name, @roleCode;
END
CLOSE cur; DEALLOCATE cur;

-- Đảm bảo ADMIN cũ được gán role ADMIN
DECLARE @adminUid int = (SELECT TOP 1 User_Id FROM dbo.Sys_Users WHERE UserCode = 'ADMIN');
DECLARE @adminRid int = (SELECT Role_Id FROM dbo.Sys_Roles WHERE RoleCode = 'ADMIN');
IF @adminUid IS NOT NULL AND @adminRid IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.Sys_User_Roles WHERE User_Id = @adminUid AND Role_Id = @adminRid)
    INSERT INTO dbo.Sys_User_Roles (User_Id, Role_Id) VALUES (@adminUid, @adminRid);

-- ── F. Seed Sys_Role_Permissions theo menuConfig.js ──────────
-- ADMIN: không seed gì (bypass)
-- Mỗi role khác: gán đúng các permissionKey cần thiết
--
-- ⚠️ CÁC KEY DƯỚI ĐÂY LÀ KEY CŨ — KHÔNG còn khớp menuConfig.js sau
-- refactor menu. File 53_reseed_role_permissions.sql chạy SAU sẽ
-- DELETE toàn bộ + re-INSERT key đúng. Block dưới giữ để file 50
-- self-contained nhưng 53 mới là nguồn chuẩn cuối cùng.

DECLARE @PermSeed TABLE (RoleCode varchar(30), PermKey varchar(80));

-- TIEP_NHAN
INSERT INTO @PermSeed VALUES
    ('TIEP_NHAN', 'barButtonItem1'),         -- Quầy tiếp nhận
    ('TIEP_NHAN', 'barButtonItem2'),         -- Đăng ký đầy đủ
    ('TIEP_NHAN', 'barButtonItem3'),         -- Kiosk
    ('TIEP_NHAN', 'barButtonItem25'),        -- Tivi tiếp nhận
    ('TIEP_NHAN', 'ribbonPage1'),            -- group Tiếp Nhận
    ('TIEP_NHAN', 'ribbonPageGroup1');

-- BAC_SI
INSERT INTO @PermSeed VALUES
    ('BAC_SI', 'barButtonItem4'),            -- Quản lý hàng đợi
    ('BAC_SI', 'barButtonBenhAnChiDinh'),    -- Bệnh án + Chỉ định
    ('BAC_SI', 'barButtonItem5'),            -- Tivi Khám bệnh
    ('BAC_SI', 'barButtonItem28'),           -- Danh sách khám bệnh
    ('BAC_SI', 'ribbonPage2'),               -- group Khám bệnh
    ('BAC_SI', 'ribbonPageGroup2');

-- KTV_CLS
INSERT INTO @PermSeed VALUES
    ('KTV_CLS', 'barButtonItem6'),           -- Quản lý hàng đợi lấy mẫu
    ('KTV_CLS', 'barButtonItem7'),           -- Tivi hàng đợi lấy mẫu
    ('KTV_CLS', 'barButtonItem26'),          -- CLS nội trú check-in
    ('KTV_CLS', 'barButtonItem8'),           -- CDHA Gọi bệnh
    ('KTV_CLS', 'barButtonItem9'),           -- CDHA Nhập bệnh
    ('KTV_CLS', 'barButtonItem10'),          -- CDHA Tivi
    ('KTV_CLS', 'ribbonPage3'),              -- group CLS
    ('KTV_CLS', 'ribbonPageGroup4'),         -- Xét nghiệm
    ('KTV_CLS', 'ribbonPageGroup5'),         -- Nội trú
    ('KTV_CLS', 'ribbonPageGroup6');         -- CDHA

-- THU_NGAN
INSERT INTO @PermSeed VALUES
    ('THU_NGAN', 'barButtonItem11'),         -- Viện phí gọi bệnh
    ('THU_NGAN', 'barButtonItem12'),         -- Viện phí Tivi
    ('THU_NGAN', 'ribbonPage4'),             -- group Viện phí
    ('THU_NGAN', 'ribbonPageGroup7');

-- DUOC_SI
INSERT INTO @PermSeed VALUES
    ('DUOC_SI', 'barButtonItem13'),          -- Nhà thuốc gọi bệnh
    ('DUOC_SI', 'barButtonItem14'),          -- Nhà thuốc Tivi
    ('DUOC_SI', 'ribbonPage5'),              -- group Nhà thuốc
    ('DUOC_SI', 'ribbonPageGroup8');

-- TRUONG_KHOA
INSERT INTO @PermSeed VALUES
    ('TRUONG_KHOA', 'barButtonDashboardKpi'),
    ('TRUONG_KHOA', 'barButtonWaitTimeMetrics'),
    ('TRUONG_KHOA', 'ribbonPageDashboard');

INSERT INTO dbo.Sys_Role_Permissions (Role_Id, PermissionKey)
SELECT r.Role_Id, p.PermKey
FROM @PermSeed p
JOIN dbo.Sys_Roles r ON r.RoleCode = p.RoleCode
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Sys_Role_Permissions x
    WHERE x.Role_Id = r.Role_Id AND x.PermissionKey = p.PermKey
);
PRINT 'OK: seed ' + CAST(@@ROWCOUNT AS varchar) + ' permission entries';

-- ── G. Verify ─────────────────────────────────────────────────

SELECT r.RoleCode,
       SoUser = (SELECT COUNT(*) FROM dbo.Sys_User_Roles WHERE Role_Id = r.Role_Id),
       SoPerm = (SELECT COUNT(*) FROM dbo.Sys_Role_Permissions WHERE Role_Id = r.Role_Id),
       r.RoleName
FROM dbo.Sys_Roles r ORDER BY r.Role_Id;

PRINT '════════════════════════════════════';
PRINT '   Role schema + seed done';
PRINT '════════════════════════════════════';
GO
