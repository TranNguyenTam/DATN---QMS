-- ════════════════════════════════════════════════════════════════
-- 45_his_light_schema.sql
-- HIS-light: 6 bảng nội bộ phục vụ workflow demo end-to-end.
-- Không động tới stub HIS_TT_* (giữ tương thích SP gốc), chỉ tạo
-- bảng KB_* riêng + thêm cột DonGia/DonViTinh/LoaiDV cho DM_DichVu.
--
-- Idempotent: dùng IF NOT EXISTS / IF COL_LENGTH IS NULL trước khi
-- CREATE / ALTER. Re-run không phá data.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

-- ── A. DM_DichVu — thêm 3 cột (giá + đơn vị + loại) ─────────────

IF COL_LENGTH('dbo.DM_DichVu', 'DonGia') IS NULL
    ALTER TABLE dbo.DM_DichVu ADD DonGia numeric(18,2) NULL;
GO
IF COL_LENGTH('dbo.DM_DichVu', 'DonViTinh') IS NULL
    ALTER TABLE dbo.DM_DichVu ADD DonViTinh nvarchar(30) NULL;
GO
IF COL_LENGTH('dbo.DM_DichVu', 'LoaiDV') IS NULL
    -- 'KhamBenh' / 'CLS' / 'CDHA' / 'Thuoc' / 'Khac'
    ALTER TABLE dbo.DM_DichVu ADD LoaiDV nvarchar(20) NULL;
GO
PRINT 'OK: DM_DichVu thêm 3 cột DonGia/DonViTinh/LoaiDV';

-- ── B. KB_BenhAn — bệnh án ngoại trú một lần khám ──────────────

IF OBJECT_ID('dbo.KB_BenhAn') IS NULL
BEGIN
    CREATE TABLE dbo.KB_BenhAn (
        BenhAn_Id           int           IDENTITY(1,1) PRIMARY KEY,
        TiepNhan_Id         int           NOT NULL,
        BenhNhan_Id         int           NOT NULL,
        HangDoiPhongBan_Id  int           NULL,
        BacSi_Id            int           NULL,
        TenBacSi            nvarchar(200) NULL,
        NgayKham            datetime      NOT NULL DEFAULT GETDATE(),
        LyDoKham            nvarchar(500) NULL,
        TrieuChung          nvarchar(1000) NULL,
        ChanDoan            nvarchar(500) NOT NULL,
        ChanDoanICD         varchar(20)   NULL,
        HuongDieuTri        nvarchar(1000) NULL,
        GhiChu              nvarchar(max) NULL,
        NgayTao             datetime      DEFAULT GETDATE(),
        NguoiTao_Id         int           NULL
    );
    CREATE INDEX IX_KB_BenhAn_BenhNhan ON dbo.KB_BenhAn(BenhNhan_Id, NgayKham DESC);
    CREATE INDEX IX_KB_BenhAn_TiepNhan ON dbo.KB_BenhAn(TiepNhan_Id);
    PRINT 'OK: KB_BenhAn created';
END
GO

-- ── C. KB_DonThuoc + chi tiết ──────────────────────────────────

IF OBJECT_ID('dbo.KB_DonThuoc') IS NULL
BEGIN
    CREATE TABLE dbo.KB_DonThuoc (
        DonThuoc_Id     int           IDENTITY(1,1) PRIMARY KEY,
        BenhAn_Id       int           NOT NULL,
        TiepNhan_Id     int           NOT NULL,
        BenhNhan_Id     int           NOT NULL,
        BacSi_Id        int           NULL,
        TenBacSi        nvarchar(200) NULL,
        NgayKe          datetime      DEFAULT GETDATE(),
        TrangThai       nvarchar(20)  DEFAULT N'ChoPhat', -- ChoPhat/DaPhat/Huy
        NgayPhat        datetime      NULL,
        NhanVienPhat_Id int           NULL,
        TenNhanVienPhat nvarchar(200) NULL,
        TongTien        numeric(18,2) DEFAULT 0,
        GhiChu          nvarchar(500) NULL
    );
    CREATE INDEX IX_KB_DonThuoc_BN ON dbo.KB_DonThuoc(BenhNhan_Id, NgayKe DESC);
    CREATE INDEX IX_KB_DonThuoc_TT ON dbo.KB_DonThuoc(TrangThai, NgayKe);

    CREATE TABLE dbo.KB_DonThuoc_ChiTiet (
        ChiTiet_Id  int           IDENTITY(1,1) PRIMARY KEY,
        DonThuoc_Id int           NOT NULL,
        DichVu_Id   int           NULL,    -- ref DM_DichVu (LoaiDV='Thuoc')
        TenThuoc    nvarchar(300) NOT NULL,
        SoLuong     numeric(10,2) NOT NULL,
        DonViTinh   nvarchar(30)  NULL,
        LieuDung    nvarchar(300) NULL,
        DonGia      numeric(18,2) DEFAULT 0,
        ThanhTien   numeric(18,2) DEFAULT 0
    );
    CREATE INDEX IX_KB_DonThuoc_CT ON dbo.KB_DonThuoc_ChiTiet(DonThuoc_Id);
    PRINT 'OK: KB_DonThuoc + KB_DonThuoc_ChiTiet created';
END
GO

-- ── D. KB_KetQuaCLS — KTV trả kết quả ─────────────────────────

IF OBJECT_ID('dbo.KB_KetQuaCLS') IS NULL
BEGIN
    CREATE TABLE dbo.KB_KetQuaCLS (
        KetQua_Id     int           IDENTITY(1,1) PRIMARY KEY,
        DVYEUCAU_ID   int           NOT NULL,  -- ref dbo.DichVuYeuCau.DVYEUCAU_ID
        BenhNhan_Id   int           NOT NULL,
        KTV_Id        int           NULL,
        TenKTV        nvarchar(200) NULL,
        KetLuan       nvarchar(2000) NULL,
        KetQuaChiTiet nvarchar(max) NULL,
        FileDinhKem   nvarchar(500) NULL,
        TrangThai     nvarchar(20)  DEFAULT N'CoKetQua',
        NgayTra       datetime      DEFAULT GETDATE()
    );
    CREATE INDEX IX_KB_KQCLS_DV ON dbo.KB_KetQuaCLS(DVYEUCAU_ID);
    CREATE INDEX IX_KB_KQCLS_BN ON dbo.KB_KetQuaCLS(BenhNhan_Id, NgayTra DESC);
    PRINT 'OK: KB_KetQuaCLS created';
END
GO

-- ── E. KB_HoaDon + chi tiết ────────────────────────────────────

IF OBJECT_ID('dbo.KB_HoaDon') IS NULL
BEGIN
    CREATE TABLE dbo.KB_HoaDon (
        HoaDon_Id          int           IDENTITY(1,1) PRIMARY KEY,
        SoHoaDon           varchar(30)   NOT NULL UNIQUE,  -- HD2605290001
        TiepNhan_Id        int           NOT NULL,
        BenhNhan_Id        int           NOT NULL,
        NgayLap            datetime      DEFAULT GETDATE(),
        TongTienGoc        numeric(18,2) DEFAULT 0,
        MienGiam           numeric(18,2) DEFAULT 0,
        BHYT_ChiTra        numeric(18,2) DEFAULT 0,
        BenhNhan_PhaiThu   numeric(18,2) DEFAULT 0,
        TrangThai          nvarchar(20)  DEFAULT N'ChuaThu', -- ChuaThu/DaThu/Huy
        NgayThu            datetime      NULL,
        NhanVienThu_Id     int           NULL,
        TenNhanVienThu     nvarchar(200) NULL,
        PhuongThuc         nvarchar(20)  NULL,  -- TienMat/Chuyen/The
        GhiChu             nvarchar(500) NULL
    );
    CREATE INDEX IX_KB_HoaDon_TN ON dbo.KB_HoaDon(TiepNhan_Id);
    CREATE INDEX IX_KB_HoaDon_BN ON dbo.KB_HoaDon(BenhNhan_Id, NgayLap DESC);
    CREATE INDEX IX_KB_HoaDon_TT ON dbo.KB_HoaDon(TrangThai, NgayLap);

    CREATE TABLE dbo.KB_HoaDon_ChiTiet (
        ChiTiet_Id  int           IDENTITY(1,1) PRIMARY KEY,
        HoaDon_Id   int           NOT NULL,
        Loai        nvarchar(20)  NOT NULL,  -- KhamBenh/CLS/CDHA/Thuoc
        RefId       int           NULL,       -- ref DVYEUCAU_ID hoặc DonThuoc_Id
        TenDichVu   nvarchar(300) NOT NULL,
        SoLuong     numeric(10,2) DEFAULT 1,
        DonGia      numeric(18,2) DEFAULT 0,
        ThanhTien   numeric(18,2) DEFAULT 0
    );
    CREATE INDEX IX_KB_HoaDon_CT ON dbo.KB_HoaDon_ChiTiet(HoaDon_Id);
    PRINT 'OK: KB_HoaDon + KB_HoaDon_ChiTiet created';
END
GO

PRINT '════════════════════════════════════';
PRINT '   HIS-light schema applied (6 tables + 3 cols)';
PRINT '════════════════════════════════════';
GO
