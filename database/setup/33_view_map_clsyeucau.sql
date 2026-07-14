-- ════════════════════════════════════════════════════════════════
-- 33_view_map_clsyeucau.sql
-- VIEW MapCLSYeuCau — facade view ánh xạ dbo.DichVuYeuCau sang
-- shape mà SP_002 mong đợi (CLSYeuCau_Id, BenhNhan_Id, NhomDichVu_Id,
-- HuyYeuCau, TrangThai...). SP_002 nhiều action SELECT/JOIN bảng
-- này. Ở K_QMS_YHCT gốc đây là bảng riêng được sync từ HIS; ở
-- QMS_DA standalone, ta dùng view qua DichVuYeuCau + DM_DichVu.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

IF OBJECT_ID('dbo.MapCLSYeuCau', 'V') IS NOT NULL DROP VIEW dbo.MapCLSYeuCau;
GO

CREATE VIEW dbo.MapCLSYeuCau
AS
SELECT
    CLSYeuCau_Id    = yc.DVYEUCAU_ID,
    BenhNhan_Id     = yc.BENHNHAN_ID,
    TiepNhan_Id     = yc.TIEPNHAN_ID,
    DichVu_Id       = yc.DICHVU_ID,
    DoiTuong_Id     = yc.DOITUONG_ID,
    BacSiChiDinh_Id = yc.BACSICHIDINH_ID,
    NoiYeuCau_Id    = yc.NOIYEUCAU_ID,
    NoiThucHien_Id  = yc.NOITHUCHIEN_ID,
    NgayYeuCau      = yc.NGAYYEUCAU,
    NgayGioYeuCau   = yc.NGAYGIOYEUCAU,
    NoiDungChiTiet  = yc.NOIDUNGCHITIET,
    ChanDoan        = yc.CHANDOAN,
    SoPhieuYeuCau   = yc.SOPHIEUYEUCAU,
    SoDichVuYeuCau  = yc.SODICHVUYEUCAU,
    TrangThai       = yc.TRANGTHAI,
    TrangThaiHangDoi = yc.TRANGTHAI_HANGDOI,
    HuyYeuCau       = yc.HUYYEUCAU,
    LyDoHuy         = yc.LYDOHUY,
    Khan            = yc.KHAN,
    GhiChu          = yc.GHICHU,
    BenhAn_Id       = CAST(NULL AS int),     -- nội trú chưa hỗ trợ ở QMS_DA → ngoại trú all
    Loai            = N'NgoaiTru',           -- SP_002 select yc.Loai cho LoaiPhieu
    NhomDichVu_Id   = dv.NHOMDICHVU_ID,
    TenDichVu       = dv.TENDICHVU,
    -- BHYTDONGTIEN cần cho 1 vài action; mặc định 0 nếu DichVuYeuCau chưa có
    BHYTDONGTIEN    = CAST(0 AS bit)
FROM dbo.DichVuYeuCau yc WITH (NOLOCK)
LEFT JOIN dbo.DM_DichVu dv WITH (NOLOCK) ON yc.DICHVU_ID = dv.DICHVU_ID;
GO

PRINT 'OK: view dbo.MapCLSYeuCau created';
GO

-- Force recompile các SP để clear cached plan (UDF mới + view mới)
EXEC sp_recompile 'dbo.SP_002_HangDoiPhongBan';
GO
PRINT 'OK: SP_002_HangDoiPhongBan marked for recompile';
GO
