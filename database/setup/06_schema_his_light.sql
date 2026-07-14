-- ════════════════════════════════════════════════════════════════
-- 06_schema_his_light.sql
-- HIS-light: tách độc lập khỏi PRODUCT_HIS của eHospital.
-- Giữ TÊN BẢNG SẠCH (BenhNhan, TiepNhan, DichVuYeuCau, ...) thay vì TT_/TM_.
-- Giữ TÊN CỘT NGUYÊN BẢN (BENHNHAN_ID, MAYTE, TENBENHNHAN, ...) để các query
-- hiện hữu (`bn.BENHNHAN_ID`, `bn.TENBENHNHAN`, `bn.NAMSINH`) vẫn hoạt động
-- sau khi rewrite `PRODUCT_HIS.dbo.TT_BENHNHAN` → `dbo.BenhNhan`.
--
-- Chỉ giữ các cột thực sự cần dùng trong app QMS (ID + định danh + cột hiển thị +
-- vài cột phụ trợ cho luồng nghiệp vụ). Bỏ qua hàng trăm cột HIS không liên quan.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

-- ─── 1. DM_LoaiDichVu ───────────────────────────────────────────
-- Phân loại dịch vụ cao nhất (KHÁM / XÉT NGHIỆM / CĐHA / VTYT / THUOC / ...).
IF OBJECT_ID('dbo.DM_LoaiDichVu', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_LoaiDichVu (
        LOAIDICHVU_ID   INT NOT NULL,
        MALOAIDICHVU    VARCHAR(20)    NOT NULL,
        TENLOAIDICHVU   NVARCHAR(200)  NULL,
        TENKHONGDAU     NVARCHAR(200)  NULL,
        TAMNGUNG        CHAR(1)        NULL,
        CONSTRAINT PK_DM_LoaiDichVu PRIMARY KEY CLUSTERED (LOAIDICHVU_ID)
    );
END;
GO

-- ─── 2. DM_NhomDichVu ───────────────────────────────────────────
-- Nhóm con dưới LoaiDichVu (ví dụ: XN máu / XN nước tiểu / ...).
IF OBJECT_ID('dbo.DM_NhomDichVu', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_NhomDichVu (
        NHOMDICHVU_ID   INT NOT NULL,
        MANHOMDICHVU    VARCHAR(20)    NOT NULL,
        LOAIDICHVU_ID   INT            NOT NULL,
        TENNHOMDICHVU   NVARCHAR(400)  NOT NULL,
        TENKHONGDAU     NVARCHAR(400)  NULL,
        CAP             INT            NOT NULL CONSTRAINT DF_DM_NhomDichVu_CAP DEFAULT (1),
        CAPTREN_ID      INT            NULL,
        TAMNGUNG        CHAR(1)        NULL,
        CONSTRAINT PK_DM_NhomDichVu PRIMARY KEY CLUSTERED (NHOMDICHVU_ID),
        CONSTRAINT FK_DM_NhomDichVu_LoaiDichVu FOREIGN KEY (LOAIDICHVU_ID) REFERENCES dbo.DM_LoaiDichVu (LOAIDICHVU_ID)
    );

    CREATE INDEX IX_DM_NhomDichVu_Loai ON dbo.DM_NhomDichVu (LOAIDICHVU_ID);
END;
GO

-- ─── 3. DM_DichVu ───────────────────────────────────────────────
-- Catalog dịch vụ (test, thủ thuật, ...). DichVu_Id được tham chiếu bởi
-- DM_ThoiGianDichVu và TT_DVYEUCAU.
IF OBJECT_ID('dbo.DM_DichVu', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_DichVu (
        DICHVU_ID            INT NOT NULL,
        NHOMDICHVU_ID        INT            NOT NULL,
        MADICHVU             VARCHAR(50)    NOT NULL,
        TENDICHVU            NVARCHAR(500)  NULL,
        TENKHONGDAU          NVARCHAR(500)  NULL,
        DONVITINH            NVARCHAR(60)   NULL,
        CAP                  INT            NOT NULL CONSTRAINT DF_DM_DichVu_CAP DEFAULT (1),
        CAPTREN_ID           INT            NULL,
        TAMNGUNG             CHAR(1)        NULL,
        BHYT                 CHAR(1)        NULL,
        THOIGIANTHUCHIEN     INT            NULL,
        CONSTRAINT PK_DM_DichVu PRIMARY KEY CLUSTERED (DICHVU_ID),
        CONSTRAINT FK_DM_DichVu_NhomDichVu FOREIGN KEY (NHOMDICHVU_ID) REFERENCES dbo.DM_NhomDichVu (NHOMDICHVU_ID)
    );

    CREATE INDEX IX_DM_DichVu_Nhom ON dbo.DM_DichVu (NHOMDICHVU_ID);
    CREATE INDEX IX_DM_DichVu_MaDichVu ON dbo.DM_DichVu (MADICHVU);
END;
GO

-- ─── 4. DM_DoiTuong ─────────────────────────────────────────────
-- Loại đối tượng BHYT (BH80 = bảo hiểm 80%, BH100, DV = dịch vụ, ...).
-- TYLE_BHYT = phần trăm BHYT chi trả (0.0 - 1.0).
IF OBJECT_ID('dbo.DM_DoiTuong', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DM_DoiTuong (
        DoiTuong_Id   INT IDENTITY(1,1) NOT NULL,
        Ma            VARCHAR(20)    NOT NULL,
        TenDoiTuong   NVARCHAR(200)  NOT NULL,
        TYLE_BHYT     DECIMAL(4,3)   NOT NULL CONSTRAINT DF_DM_DoiTuong_TYLE_BHYT DEFAULT (0),
        BHYT_5NAM     BIT            NOT NULL CONSTRAINT DF_DM_DoiTuong_BHYT_5NAM DEFAULT (0),
        Huy           INT            NULL,
        CONSTRAINT PK_DM_DoiTuong PRIMARY KEY CLUSTERED (DoiTuong_Id),
        CONSTRAINT UQ_DM_DoiTuong_Ma UNIQUE (Ma)
    );
END;
GO

-- ─── 5. BenhNhan ────────────────────────────────────────────────
-- Hồ sơ bệnh nhân. Giữ tên cột nguyên bản (BENHNHAN_ID, MAYTE, TENBENHNHAN, NAMSINH)
-- để query `bn.BENHNHAN_ID = h.BenhNhan_Id` không cần đổi.
-- Bỏ ~50 cột HIS không dùng (CMND, HOCHIEU, NHOMMAU, TUVONG, ...).
IF OBJECT_ID('dbo.BenhNhan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BenhNhan (
        BENHNHAN_ID     INT NOT NULL,
        MAYTE           VARCHAR(20)    NOT NULL,
        SOVAOVIEN       VARCHAR(10)    NULL,
        TENBENHNHAN     NVARCHAR(122)  NOT NULL,
        HO              NVARCHAR(40)   NULL,
        TEN             NVARCHAR(80)   NULL,
        GIOITINH        INT            NULL,
        NGAYSINH        SMALLDATETIME  NULL,
        NAMSINH         SMALLINT       NULL,
        SODIENTHOAI     VARCHAR(50)    NULL,
        DIACHI          NVARCHAR(300)  NULL,
        DIACHITHUONGTRU NVARCHAR(600)  NULL,
        CMND            VARCHAR(20)    NULL,
        EMAIL           NVARCHAR(100)  NULL,
        ACTIVE          CHAR(1)        NOT NULL CONSTRAINT DF_BenhNhan_ACTIVE DEFAULT ('1'),
        NGAYTAO         DATETIME       NULL,
        NGUOITAO_ID     INT            NULL,
        NGAYCAPNHAT     DATETIME       NULL,
        NGUOICAPNHAT_ID INT            NULL,
        CONSTRAINT PK_BenhNhan PRIMARY KEY CLUSTERED (BENHNHAN_ID)
    );

    CREATE UNIQUE INDEX UX_BenhNhan_MAYTE ON dbo.BenhNhan (MAYTE);
    CREATE INDEX IX_BenhNhan_TENBENHNHAN ON dbo.BenhNhan (TENBENHNHAN);
END;
GO

-- ─── 6. BenhNhan_BHYT ───────────────────────────────────────────
-- Thẻ BHYT của BN (một BN có thể có nhiều thẻ qua thời gian).
IF OBJECT_ID('dbo.BenhNhan_BHYT', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BenhNhan_BHYT (
        BENHNHAN_BHYT_ID    INT IDENTITY(1,1) NOT NULL,
        BENHNHAN_ID         INT            NOT NULL,
        LOAIBHYT            INT            NULL,
        SOTHE               NVARCHAR(50)   NOT NULL,
        NGAYCAP             SMALLDATETIME  NULL,
        NGAYHIEULUC         SMALLDATETIME  NULL,
        NGAYHETHIEULUC      SMALLDATETIME  NULL,
        TREN6THANG          CHAR(1)        NULL,
        TREN3NAM            CHAR(1)        NULL,
        TREN5NAM            CHAR(1)        NULL,
        NGAYMIENDONGCHITRA  SMALLDATETIME  NULL,
        KHUVUCSONG_ID       INT            NULL,
        BENHVIEN_KCB_ID     VARCHAR(10)    NULL,
        TAMNGUNG            CHAR(1)        NULL,
        NGAYTAO             DATETIME       NULL,
        NGAYCAPNHAT         DATETIME       NULL,
        CONSTRAINT PK_BenhNhan_BHYT PRIMARY KEY CLUSTERED (BENHNHAN_BHYT_ID),
        CONSTRAINT FK_BenhNhan_BHYT_BenhNhan FOREIGN KEY (BENHNHAN_ID) REFERENCES dbo.BenhNhan (BENHNHAN_ID)
    );

    CREATE INDEX IX_BenhNhan_BHYT_BN ON dbo.BenhNhan_BHYT (BENHNHAN_ID);
    CREATE INDEX IX_BenhNhan_BHYT_SOTHE ON dbo.BenhNhan_BHYT (SOTHE);
END;
GO

-- ─── 7. TiepNhan ────────────────────────────────────────────────
-- Phiếu tiếp nhận (ehospital). Backend QMS chỉ đọc một vài cột định danh +
-- thời gian + loại BHYT. Bỏ qua các cột HIS-only (process, khoa dữ liệu, ...).
IF OBJECT_ID('dbo.TiepNhan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TiepNhan (
        TIEPNHAN_ID         INT IDENTITY(1,1) NOT NULL,
        SOTIEPNHAN          VARCHAR(20)   NOT NULL,
        SOTHUTU             VARCHAR(10)   NULL,
        BENHNHAN_ID         INT           NOT NULL,
        NOITIEPNHAN_ID      INT           NOT NULL,
        NGAYTIEPNHAN        SMALLDATETIME NOT NULL,
        NAMTIEPNHAN         SMALLINT      NOT NULL,
        THANGTIEPNHAN       TINYINT       NOT NULL,
        THOIGIANTIEPNHAN    DATETIME      NOT NULL,
        DOITUONG_ID         VARCHAR(5)    NULL,
        LOAITIEPNHAN_ID     INT           NULL,
        HINHTHUCDENKHAM_ID  INT           NULL,
        LOAIBHYT            INT           NULL,
        SOBHYT              NVARCHAR(60)  NULL,
        BHYTTUNGAY          SMALLDATETIME NULL,
        BHYTDENNGAY         SMALLDATETIME NULL,
        BHYTNGAYCAP         SMALLDATETIME NULL,
        BHYTTREN5NAM        CHAR(1)       NULL,
        NGAYMIENDONGCHITRA  SMALLDATETIME NULL,
        UUTIEN              CHAR(1)       NULL,
        VIP                 CHAR(1)       NULL,
        TAIKHAM             CHAR(1)       NULL,
        TRANGTHAI           VARCHAR(20)   NULL,
        LYDODENKHAM         NVARCHAR(1000) NULL,
        GHICHU_TIEPNHAN     NVARCHAR(1000) NULL,
        NGAYTAO             DATETIME      NULL,
        NGUOITAO_ID         INT           NULL,
        NGAYCAPNHAT         DATETIME      NULL,
        NGUOICAPNHAT_ID     INT           NULL,
        CONSTRAINT PK_TiepNhan PRIMARY KEY CLUSTERED (TIEPNHAN_ID),
        CONSTRAINT FK_TiepNhan_BenhNhan FOREIGN KEY (BENHNHAN_ID) REFERENCES dbo.BenhNhan (BENHNHAN_ID)
    );

    CREATE INDEX IX_TiepNhan_BN_NgayTN ON dbo.TiepNhan (BENHNHAN_ID, NGAYTIEPNHAN DESC);
    CREATE INDEX IX_TiepNhan_NgayTN ON dbo.TiepNhan (NGAYTIEPNHAN);
END;
GO

-- ─── 8. DichVuYeuCau ────────────────────────────────────────────
-- Dịch vụ yêu cầu (chỉ định CLS/CĐHA/...) cho 1 phiếu TN. Backend QMS dùng để
-- biết BN nội trú có CLS gì chưa thực hiện. Lược bỏ rất nhiều cột HIS (CLOTest,
-- sinh thiết, hợp đồng, ...) chỉ giữ cột định danh + trạng thái + nội dung.
IF OBJECT_ID('dbo.DichVuYeuCau', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DichVuYeuCau (
        DVYEUCAU_ID         INT IDENTITY(1,1) NOT NULL,
        SODICHVUYEUCAU      SMALLINT      NOT NULL,
        SOPHIEUYEUCAU       VARCHAR(15)   NOT NULL,
        SOTHUTU             VARCHAR(10)   NULL,
        NGAYYEUCAU          SMALLDATETIME NOT NULL,
        THANGYEUCAU         TINYINT       NOT NULL,
        NAMYEUCAU           SMALLINT      NOT NULL,
        NGAYGIOYEUCAU       DATETIME      NOT NULL,
        TIEPNHAN_ID         INT           NULL,
        BENHNHAN_ID         INT           NULL,
        DOITUONG_ID         INT           NULL,
        DICHVU_ID           INT           NULL,
        NOIYEUCAU_ID        INT           NULL,
        NOITHUCHIEN_ID      INT           NULL,
        BACSICHIDINH_ID     INT           NULL,
        NGUOICHIDINH_ID     INT           NULL,
        NOIDUNGCHITIET      NVARCHAR(MAX) NULL,
        CHANDOAN            NVARCHAR(2000) NULL,
        TRIEUCHUNG          NVARCHAR(500) NULL,
        VITRIKHAOSAT        NVARCHAR(400) NULL,
        BENHPHAM            NVARCHAR(500) NULL,
        DALAYMAU            CHAR(1)       NULL,
        DANHANBENHPHAM      CHAR(1)       NULL,
        NGAYNHANBENHPHAM    SMALLDATETIME NULL,
        TRANGTHAI           VARCHAR(20)   NOT NULL,
        TRANGTHAI_HANGDOI   VARCHAR(20)   NULL,
        HUYYEUCAU           CHAR(1)       NOT NULL CONSTRAINT DF_DichVuYeuCau_HUYYEUCAU DEFAULT ('0'),
        LYDOHUY             NVARCHAR(500) NULL,
        KHAN                CHAR(1)       NULL,
        GHICHU              NVARCHAR(500) NULL,
        NGAYTAO             DATETIME      NULL,
        NGUOITAO_ID         INT           NULL,
        NGAYCAPNHAT         DATETIME      NULL,
        NGUOICAPNHAT_ID     INT           NULL,
        CONSTRAINT PK_DichVuYeuCau PRIMARY KEY CLUSTERED (DVYEUCAU_ID),
        CONSTRAINT FK_DichVuYeuCau_TiepNhan FOREIGN KEY (TIEPNHAN_ID) REFERENCES dbo.TiepNhan (TIEPNHAN_ID),
        CONSTRAINT FK_DichVuYeuCau_BenhNhan FOREIGN KEY (BENHNHAN_ID) REFERENCES dbo.BenhNhan (BENHNHAN_ID),
        CONSTRAINT FK_DichVuYeuCau_DichVu   FOREIGN KEY (DICHVU_ID)   REFERENCES dbo.DM_DichVu (DICHVU_ID)
    );

    CREATE INDEX IX_DichVuYeuCau_TN       ON dbo.DichVuYeuCau (TIEPNHAN_ID);
    CREATE INDEX IX_DichVuYeuCau_BN_Ngay  ON dbo.DichVuYeuCau (BENHNHAN_ID, NGAYYEUCAU DESC);
    CREATE INDEX IX_DichVuYeuCau_SOPhieu  ON dbo.DichVuYeuCau (SOPHIEUYEUCAU);
    CREATE INDEX IX_DichVuYeuCau_TrangThai ON dbo.DichVuYeuCau (TRANGTHAI);
END;
GO

PRINT 'OK: 06_schema_his_light.sql applied';
GO
