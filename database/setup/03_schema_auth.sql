-- ════════════════════════════════════════════════════════════════
-- 03_schema_auth.sql
-- Authn / Authz: user, role, menu, permission, refresh token.
--   * Sys_Users           — bảng user chính (UserCode = ADMIN bypass mọi permission)
--   * Sys_Users_PhongBan  — gán user vào phòng/hàng đợi (filter scope)
--   * Menu                — cấu trúc menu (cây parent-child)
--   * Permission          — phân quyền menu cho từng user
--   * RefreshToken        — JWT refresh token rotation
--
-- Cấu trúc clone từ K_QMS_YHCT — KHÔNG đổi tên cột.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

-- ─── 1. Sys_Users ───────────────────────────────────────────────
IF OBJECT_ID('dbo.Sys_Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sys_Users (
        User_Id              INT IDENTITY(1,1) NOT NULL,
        UserCode             NVARCHAR(50)   NULL,
        UserName             NVARCHAR(250)  NULL,
        Password             NVARCHAR(500)  NULL,
        BenhVien_Id          INT            NULL,
        TamNgung             INT            NULL,
        NguoiTao             INT            NULL,
        NgayTao              DATETIME       NULL,
        NguoiCapNhat         INT            NULL,
        NgayCapNhat          DATETIME       NULL,
        Huy                  INT            NULL,
        MoTaMay              NVARCHAR(250)  NULL,
        MoTaKetNoiMay        NVARCHAR(250)  NULL,
        MoTaKetNoiTiVi       NVARCHAR(250)  NULL,
        MoTaKetNoiAmThanh    NVARCHAR(250)  NULL,
        TenTivi              NVARCHAR(255)  NULL,
        TenAmThanh           NVARCHAR(255)  NULL,
        CONSTRAINT PK_Sys_Users PRIMARY KEY CLUSTERED (User_Id)
    );

    CREATE INDEX IX_Sys_Users_UserCode ON dbo.Sys_Users (UserCode);
END;
GO

-- ─── 2. Sys_Users_PhongBan ──────────────────────────────────────
-- Gán user vào (PhongBan_Id, HangDoi_Id). 1 user có thể có nhiều dòng.
IF OBJECT_ID('dbo.Sys_Users_PhongBan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sys_Users_PhongBan (
        User_PhongBan_Id INT IDENTITY(1,1) NOT NULL,
        User_Id          INT NULL,
        PhongBan_Id      INT NULL,
        HangDoi_Id       INT NULL,
        CONSTRAINT PK_Sys_Users_PhongBan PRIMARY KEY CLUSTERED (User_PhongBan_Id)
    );

    CREATE INDEX IX_Sys_Users_PhongBan_User ON dbo.Sys_Users_PhongBan (User_Id);
END;
GO

-- ─── 3. Menu ────────────────────────────────────────────────────
-- Cây menu: ParentMenu trỏ tới Menu_Id của node cha (NULL = root).
IF OBJECT_ID('dbo.Menu', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Menu (
        Menu_Id       INT IDENTITY(1,1) NOT NULL,
        MenuCode      NVARCHAR(50)  NULL,
        MenuName      NVARCHAR(250) NULL,
        ParentMenu    INT           NULL,
        TamNgung      INT           NULL,
        NgayTao       DATETIME      NULL,
        NguoiTao      INT           NULL,
        NgayCapNhat   DATETIME      NULL,
        NguoiCapNhat  INT           NULL,
        Huy           INT           NULL,
        CONSTRAINT PK_Menu PRIMARY KEY CLUSTERED (Menu_Id)
    );

    CREATE INDEX IX_Menu_ParentMenu ON dbo.Menu (ParentMenu);
END;
GO

-- ─── 4. Permission ──────────────────────────────────────────────
-- (User_Id, Menu_Id) — cho phép user truy cập menu nào.
IF OBJECT_ID('dbo.Permission', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Permission (
        Permission_Id INT IDENTITY(1,1) NOT NULL,
        User_Id       INT NULL,
        Menu_Id       INT NULL,
        CONSTRAINT PK_Permission PRIMARY KEY CLUSTERED (Permission_Id)
    );

    CREATE INDEX IX_Permission_User ON dbo.Permission (User_Id);
    CREATE INDEX IX_Permission_Menu ON dbo.Permission (Menu_Id);
END;
GO

-- ─── 5. RefreshToken ────────────────────────────────────────────
-- JWT refresh token. AuthService giữ TỐI ĐA 2 token/user (rotation).
IF OBJECT_ID('dbo.RefreshToken', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RefreshToken (
        id             INT IDENTITY(1,1) NOT NULL,
        user_id        INT            NOT NULL,
        token          NVARCHAR(255)  NOT NULL,
        expires_at     DATETIME2(7)   NULL,
        created_at     DATETIME2(7)   NULL,
        created_by_ip  NVARCHAR(255)  NULL,
        is_revoked     BIT            NOT NULL CONSTRAINT DF_RefreshToken_is_revoked DEFAULT (0),
        CONSTRAINT PK_RefreshToken PRIMARY KEY CLUSTERED (id)
    );

    CREATE INDEX IX_RefreshToken_user_id ON dbo.RefreshToken (user_id);
    CREATE INDEX IX_RefreshToken_token   ON dbo.RefreshToken (token);
END;
GO

PRINT 'OK: 03_schema_auth.sql applied';
GO
