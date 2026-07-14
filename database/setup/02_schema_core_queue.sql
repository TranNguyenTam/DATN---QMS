-- ════════════════════════════════════════════════════════════════
-- 02_schema_core_queue.sql
-- Các bảng hàng đợi chính của QMS:
--   * HangDoiPhongBan       — bảng core, mọi module (TN/KB/CLS/VP/NT/CDHA) đều insert vào đây
--   * HangDoiPhongBanChiTiet — chi tiết phụ (tên BN tự nhập khi Kiosk không có hồ sơ)
--   * K_HangDoiTiepNhan     — bảng legacy cho luồng "Lấy số nhanh" ở Kiosk (chỉ STT, BN chưa có Id)
--
-- Cấu trúc clone từ K_QMS_YHCT (server công ty) — giữ nguyên tên cột tiếng Việt
-- để khớp với stored procedure binding.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

-- ─── 1. HangDoiPhongBan ─────────────────────────────────────────
-- Mỗi BN khi vào module (khám/CLS/viện phí/...) sinh ra một dòng ở đây.
-- Các flag TinhTrang/Huy/BoQua điều khiển trạng thái gọi/hoàn tất.
IF OBJECT_ID('dbo.HangDoiPhongBan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HangDoiPhongBan (
        HangDoiPhongBan_Id     INT IDENTITY(1,1) NOT NULL,
        HangDoi_Id             INT            NULL,
        PhongBan_Id            INT            NULL,
        STT                    INT            NULL,
        SoThuTuDayDu           NVARCHAR(50)   NULL,
        STTTheoLoaiPhongBan    INT            NULL,
        UuTien                 INT            NULL,
        YeuCau                 INT            NULL,
        TinhTrang              INT            NULL,
        NgayThucHien           DATETIME       NULL,
        NgayGioLaySo           DATETIME       NULL,
        NgayGioThucHien        DATETIME       NULL,
        NgayGioHoanTat         DATETIME       NULL,
        BenhNhan_Id            INT            NULL,
        CLSYeuCau_Id           INT            NULL,
        LoaiPhieu              NVARCHAR(50)   NULL,
        Huy                    INT            NULL,
        PhongBanGoi_Id         INT            NULL,
        NoiDung                NVARCHAR(MAX)  NULL,
        ThoiGian               NVARCHAR(50)   NULL,
        BoQua                  INT            NULL,
        SoLuongChiDinh         INT            NULL,
        TinhTrangHienTai       NVARCHAR(50)   NULL,
        ViTriHienTai           NVARCHAR(250)  NULL,
        Khoa                   INT            NULL,
        NoiDungDaThucHien      NVARCHAR(MAX)  NULL,
        LoaiUuTien             NVARCHAR(MAX)  NULL,
        CONSTRAINT PK_HangDoiPhongBan PRIMARY KEY CLUSTERED (HangDoiPhongBan_Id)
    );

    CREATE INDEX IX_HangDoiPhongBan_NgayGioLaySo   ON dbo.HangDoiPhongBan (NgayGioLaySo DESC);
    CREATE INDEX IX_HangDoiPhongBan_NgayThucHien   ON dbo.HangDoiPhongBan (NgayThucHien, HangDoi_Id, PhongBan_Id);
    CREATE INDEX IX_HangDoiPhongBan_HangDoi        ON dbo.HangDoiPhongBan (HangDoi_Id, TinhTrang, Huy);
    CREATE INDEX IX_HangDoiPhongBan_BenhNhan       ON dbo.HangDoiPhongBan (BenhNhan_Id);
END;
GO

-- ─── 2. HangDoiPhongBanChiTiet ──────────────────────────────────
-- Lưu tên BN tự nhập khi Kiosk hoặc TN nhanh chưa biết BenhNhan_Id eHospital.
IF OBJECT_ID('dbo.HangDoiPhongBanChiTiet', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HangDoiPhongBanChiTiet (
        HangDoiPhongBanChiTiet_Id INT IDENTITY(1,1) NOT NULL,
        HangDoiPhongBan_Id        INT           NULL,
        TenBenhNhan               NVARCHAR(250) NULL,
        Tuoi                      INT           NULL,
        CONSTRAINT PK_HangDoiPhongBanChiTiet PRIMARY KEY CLUSTERED (HangDoiPhongBanChiTiet_Id)
    );

    CREATE INDEX IX_HangDoiPhongBanChiTiet_HDPB ON dbo.HangDoiPhongBanChiTiet (HangDoiPhongBan_Id);
END;
GO

-- ─── 3. K_HangDoiTiepNhan ───────────────────────────────────────
-- Luồng A "Lấy số nhanh" ở Kiosk: BN bấm nút vàng → tạo row chỉ có STT,
-- chưa có BenhNhan_Id. Quầy gọi → BN đến nhập mã y tế.
IF OBJECT_ID('dbo.K_HangDoiTiepNhan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.K_HangDoiTiepNhan (
        HangDoiTiepNhan_Id      INT IDENTITY(1,1) NOT NULL,
        HangDoi_Id              INT           NULL,
        STT                     INT           NULL,
        TinhTrang               INT           NULL,
        NgayGioBocSo            DATETIME      NULL,
        NgayGioTiepNhan         DATETIME      NULL,
        QuayTiepNhan            INT           NULL,
        NgayGioHoanTatTiepNhan  DATETIME      NULL,
        BenhNhan_Id             INT           NULL,
        SoVaoVien               NVARCHAR(50)  NULL,
        TiepNhan_Id             INT           NULL,
        Huy                     INT           NULL,
        UuTien                  INT           NULL,
        DoiTuongUuTien          INT           NULL,
        CONSTRAINT PK_K_HangDoiTiepNhan PRIMARY KEY CLUSTERED (HangDoiTiepNhan_Id)
    );

    CREATE INDEX IX_K_HangDoiTiepNhan_NgayGioBocSo ON dbo.K_HangDoiTiepNhan (NgayGioBocSo DESC);
    CREATE INDEX IX_K_HangDoiTiepNhan_HangDoi      ON dbo.K_HangDoiTiepNhan (HangDoi_Id, TinhTrang, Huy);
END;
GO

PRINT 'OK: 02_schema_core_queue.sql applied';
GO
