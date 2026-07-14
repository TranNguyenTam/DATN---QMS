-- ════════════════════════════════════════════════════════════════
-- 01_create_database.sql
-- Tạo database QMS_DA + SQL login cho backend kết nối.
--
-- Chạy với quyền sysadmin (LUÔN thêm -f 65001 để sqlcmd đọc file UTF-8;
-- nếu thiếu, mặc định sqlcmd đọc cp1252/cp1258 → tiếng Việt N'...' bị
-- lưu mojibake vào DB, vd "Bạn" thành "Báº¡n"):
--   sqlcmd -S "localhost\SQLEXPRESS" -E -f 65001 -i 01_create_database.sql
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ─── 1. Tạo database ─────────────────────────────────────────────
IF DB_ID('QMS_DA') IS NULL
BEGIN
    -- WITH CATALOG_COLLATION = SQL_Latin1_General_CP1_CI_AS bắt buộc trên SQL
    -- Server 2025+ vì mặc định catalog collation là CS (case-sensitive contained),
    -- khiến tên cột không khớp khi SP tham chiếu kiểu chữ khác — vd 'ngaygiothuchien'
    -- không resolve được tới cột 'NgayGioThucHien'.
    CREATE DATABASE QMS_DA
        COLLATE Vietnamese_CI_AS
        WITH CATALOG_COLLATION = SQL_Latin1_General_CP1_CI_AS;
    PRINT 'Da tao database QMS_DA';
END
ELSE
    PRINT 'Database QMS_DA da ton tai';
GO

-- ─── 2. Bật các ANSI option cần thiết cho filtered index ─────────
ALTER DATABASE QMS_DA SET QUOTED_IDENTIFIER ON;
ALTER DATABASE QMS_DA SET ANSI_NULLS ON;
ALTER DATABASE QMS_DA SET ANSI_PADDING ON;
ALTER DATABASE QMS_DA SET CONCAT_NULL_YIELDS_NULL ON;
GO

-- ─── 3. Tạo SQL login + user database (cho backend dùng) ─────────
USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'qms_app')
BEGIN
    CREATE LOGIN qms_app
        WITH PASSWORD = N'QmsLocalDev#2025',
             CHECK_POLICY = OFF,
             DEFAULT_DATABASE = QMS_DA;
    PRINT 'Da tao SQL login: qms_app';
END
ELSE
    PRINT 'Login qms_app da ton tai';
GO

USE QMS_DA;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'qms_app')
BEGIN
    CREATE USER qms_app FOR LOGIN qms_app;
    -- Quyền đầy đủ trên database (đồ án — dev mode)
    ALTER ROLE db_owner ADD MEMBER qms_app;
    PRINT 'Da map user qms_app vao QMS_DA voi quyen db_owner';
END
ELSE
    PRINT 'User qms_app da ton tai trong QMS_DA';
GO

PRINT '════════════════════════════════════════════';
PRINT 'OK: Database QMS_DA san sang';
PRINT 'Dung connection string trong .env.example de ket noi.';
PRINT '  (Password mac dinh dev: QmsLocalDev#2025 -- doi o production)';
PRINT '════════════════════════════════════════════';
GO
