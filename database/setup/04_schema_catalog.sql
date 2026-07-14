-- ════════════════════════════════════════════════════════════════
-- 04_schema_catalog.sql
-- Danh mục (catalog) cho QMS.
--   * DM_HangDoi              — định nghĩa hàng đợi (Khám=3, ViệnPhí=4, NT=5, CLS=6, CDHA=7-10, ...)
--   * DM_PhongBan             — phòng/buồng vật lý
--   * DM_PhongBanLoaiPhongBan — loại phòng (khoa khám / xét nghiệm / ...)
--   * DM_NoiDungDacBiet       — nội dung đặc biệt (banner/note) gán theo phòng/hàng đợi
--   * DM_ThoiGianDichVu       — định mức thời gian thực hiện theo dịch vụ (dùng cho dự báo wait time)
--   * K_DM_DoiTuongUuTien     — loại ưu tiên (cấp cứu, người già, trẻ em, ...)
--   * K_DM_GioiThieu          — nội dung scroll giới thiệu Kiosk
--   * K_DM_QuayTiepNhan       — danh sách quầy TN
--   * DM_Sounds_*             — cache audio TTS (BN, hệ thống, tên BN)
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

-- ─── 1. DM_HangDoi ──────────────────────────────────────────────
IF OBJECT_ID('dbo.DM_HangDoi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_HangDoi (
        HangDoi_Id             INT IDENTITY(1,1) NOT NULL,
        MaHangDoi              NVARCHAR(50)  NULL,
        TenHangDoi             NVARCHAR(250) NULL,
        KyTuSTT                NVARCHAR(10)  NULL,
        TamNgung               INT           NULL,
        NgayTao                DATETIME      NULL,
        NguoiTao               INT           NULL,
        NgayCapNhat            DATETIME      NULL,
        NguoiCapNhat           INT           NULL,
        Huy                    INT           NULL,
        Sound_Id_KyTu          INT           NULL,
        PhongBanEhospital_Id   INT           NULL,
        CONSTRAINT PK_DM_HangDoi PRIMARY KEY CLUSTERED (HangDoi_Id)
    );
END;
GO

-- ─── 2. DM_PhongBan ─────────────────────────────────────────────
IF OBJECT_ID('dbo.DM_PhongBan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_PhongBan (
        PhongBan_Id            INT IDENTITY(1,1) NOT NULL,
        TenPhongBan            NVARCHAR(150) NULL,
        TenPhongBanDayDu       NVARCHAR(250) NULL,
        PhongBanEhospital_Id   INT           NULL,
        STTPhongBan            NVARCHAR(10)  NULL,
        LoaiPhongBan           INT           NULL,
        TamNgung               INT           NULL,
        Huy                    INT           NULL,
        NgayTao                DATETIME      NULL,
        NguoiTao               INT           NULL,
        NgayCapNhat            DATETIME      NULL,
        NguoiCapNhat           INT           NULL,
        MoTa                   NVARCHAR(250) NULL,
        Sound_Id_PhongBan      INT           NULL,
        CONSTRAINT PK_DM_PhongBan PRIMARY KEY CLUSTERED (PhongBan_Id)
    );

    CREATE INDEX IX_DM_PhongBan_LoaiPhongBan ON dbo.DM_PhongBan (LoaiPhongBan);
END;
GO

-- ─── 3. DM_PhongBanLoaiPhongBan ─────────────────────────────────
IF OBJECT_ID('dbo.DM_PhongBanLoaiPhongBan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_PhongBanLoaiPhongBan (
        LoaiPhongBan_Id        INT IDENTITY(1,1) NOT NULL,
        TenLoaiPhongBan        NVARCHAR(150) NULL,
        TenLoaiPhongBanDayDu   NVARCHAR(250) NULL,
        STTPhongBan            NVARCHAR(10)  NULL,
        TamNgung               INT           NULL,
        Huy                    INT           NULL,
        NgayTao                DATETIME      NULL,
        NguoiTao               INT           NULL,
        NgayCapNhat            DATETIME      NULL,
        NguoiCapNhat           INT           NULL,
        MoTa                   NVARCHAR(250) NULL,
        CONSTRAINT PK_DM_PhongBanLoaiPhongBan PRIMARY KEY CLUSTERED (LoaiPhongBan_Id)
    );
END;
GO

-- ─── 4. DM_NoiDungDacBiet ───────────────────────────────────────
IF OBJECT_ID('dbo.DM_NoiDungDacBiet', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_NoiDungDacBiet (
        NoiDungDacBiet_Id INT IDENTITY(1,1) NOT NULL,
        TenNoiDung        NVARCHAR(250) NULL,
        Loai              NVARCHAR(50)  NULL,
        PhongBan_Id       INT           NULL,
        HangDoi_Id        INT           NULL,
        TamNgung          INT           NULL,
        Huy               INT           NULL,
        NgayTao           DATETIME      NULL,
        NguoiTao          INT           NULL,
        NgayCapNhat       DATETIME      NULL,
        NguoiCapNhat      INT           NULL,
        IdLienQuan        INT           NULL,
        CONSTRAINT PK_DM_NoiDungDacBiet PRIMARY KEY CLUSTERED (NoiDungDacBiet_Id)
    );
END;
GO

-- ─── 5. DM_ThoiGianDichVu ───────────────────────────────────────
-- Định mức thời gian (phút) thực hiện theo DichVu_Id.
IF OBJECT_ID('dbo.DM_ThoiGianDichVu', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_ThoiGianDichVu (
        Id            INT IDENTITY(1,1) NOT NULL,
        Time          INT       NULL,
        DichVu_Id     INT       NULL,
        TamNgung      INT       NULL,
        NgayTao       DATETIME  NULL,
        NguoiTao      INT       NULL,
        NgayCapNhat   DATETIME  NULL,
        NguoiCapNhat  INT       NULL,
        Huy           INT       NULL,
        CONSTRAINT PK_DM_ThoiGianDichVu PRIMARY KEY CLUSTERED (Id)
    );

    CREATE INDEX IX_DM_ThoiGianDichVu_DichVu ON dbo.DM_ThoiGianDichVu (DichVu_Id);
END;
GO

-- ─── 6. K_DM_DoiTuongUuTien ─────────────────────────────────────
IF OBJECT_ID('dbo.K_DM_DoiTuongUuTien', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.K_DM_DoiTuongUuTien (
        DoiTuongUuTien_Id INT IDENTITY(1,1) NOT NULL,
        TenDoiTuong       NVARCHAR(250) NULL,
        Huy               INT           NULL,
        CONSTRAINT PK_K_DM_DoiTuongUuTien PRIMARY KEY CLUSTERED (DoiTuongUuTien_Id)
    );
END;
GO

-- ─── 7. K_DM_GioiThieu ──────────────────────────────────────────
IF OBJECT_ID('dbo.K_DM_GioiThieu', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.K_DM_GioiThieu (
        GioiThieu_Id      INT IDENTITY(1,1) NOT NULL,
        NoiDungGioiThieu  NVARCHAR(MAX) NULL,
        Huy               INT           NULL,
        CONSTRAINT PK_K_DM_GioiThieu PRIMARY KEY CLUSTERED (GioiThieu_Id)
    );
END;
GO

-- ─── 8. K_DM_QuayTiepNhan ───────────────────────────────────────
IF OBJECT_ID('dbo.K_DM_QuayTiepNhan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.K_DM_QuayTiepNhan (
        QuayTiepNhan_Id         INT IDENTITY(1,1) NOT NULL,
        TenQuayTiepNhan         NVARCHAR(60) NULL,
        SoThuTuQuay             INT          NULL,
        HangDoi_QuayTiepNhan_Id INT          NULL,
        User_QuayTiepNhan_Id    INT          NULL,
        TamNgung                INT          NULL,
        Huy                     INT          NULL,
        CONSTRAINT PK_K_DM_QuayTiepNhan PRIMARY KEY CLUSTERED (QuayTiepNhan_Id)
    );
END;
GO

-- ─── 9. DM_Sounds_BenhNhan ──────────────────────────────────────
-- Cache audio TTS theo BN (gọi tên BN).
IF OBJECT_ID('dbo.DM_Sounds_BenhNhan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_Sounds_BenhNhan (
        IDx          INT IDENTITY(1,1) NOT NULL,
        BenhNhan_Id  INT           NULL,
        TrangThai    NVARCHAR(50)  NULL,
        NoiDung      NVARCHAR(MAX) NULL,
        TenFile      NVARCHAR(MAX) NULL,
        NgayTao      DATETIME      NULL,
        NgayCapNhat  DATETIME      NULL,
        Lenth        INT           NULL,
        CONSTRAINT PK_DM_Sounds_BenhNhan PRIMARY KEY CLUSTERED (IDx)
    );

    CREATE INDEX IX_DM_Sounds_BenhNhan_BN ON dbo.DM_Sounds_BenhNhan (BenhNhan_Id);
END;
GO

-- ─── 10. DM_Sounds_HeThong ──────────────────────────────────────
-- Cache audio cố định của hệ thống (ví dụ "Mời số thứ tự", ...).
IF OBJECT_ID('dbo.DM_Sounds_HeThong', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_Sounds_HeThong (
        Sound_Id    INT IDENTITY(1,1) NOT NULL,
        TrangThai   INT           NULL,
        NoiDung     NVARCHAR(200) NULL,
        TenFile     NVARCHAR(MAX) NULL,
        NgayTao     DATETIME      NULL,
        CONSTRAINT PK_DM_Sounds_HeThong PRIMARY KEY CLUSTERED (Sound_Id)
    );
END;
GO

-- ─── 11. DM_Sounds_TenBenhNhan ──────────────────────────────────
-- Cache audio TTS theo tên BN (key = TenBenhNhan để dùng lại).
IF OBJECT_ID('dbo.DM_Sounds_TenBenhNhan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_Sounds_TenBenhNhan (
        IDx          INT IDENTITY(1,1) NOT NULL,
        TenBenhNhan  NVARCHAR(250) NULL,
        TenFile      NVARCHAR(MAX) NULL,
        NgayTao      DATETIME      NULL,
        NgayCapNhat  DATETIME      NULL,
        Lenth        INT           NULL,
        CONSTRAINT PK_DM_Sounds_TenBenhNhan PRIMARY KEY CLUSTERED (IDx)
    );

    CREATE INDEX IX_DM_Sounds_TenBenhNhan_TenBN ON dbo.DM_Sounds_TenBenhNhan (TenBenhNhan);
END;
GO

PRINT 'OK: 04_schema_catalog.sql applied';
GO
