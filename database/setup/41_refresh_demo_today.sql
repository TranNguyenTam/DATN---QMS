-- ════════════════════════════════════════════════════════════════
-- 41_refresh_demo_today.sql
-- Dời toàn bộ data demo (HangDoiPhongBan / K_HangDoiTiepNhan /
-- TiepNhan / DichVuYeuCau) sang NGÀY HÔM NAY.
--
-- Lý do: mọi SP_002 / SP_004 filter `WHERE NgayThucHien =
-- CONVERT(date, GETDATE())`. Data seed/test có ngày cố định
-- (vd 2026-05-15) → sang ngày khác toàn hệ thống "No data".
--
-- Script idempotent + chạy lại được mỗi ngày: tính offset =
-- số ngày giữa ngày demo gần nhất và hôm nay, rồi DATEADD tất
-- cả cột ngày (giữ nguyên giờ/phút để thứ tự STT không đổi).
-- Chạy script này mỗi sáng trước khi demo.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

DECLARE @Today date = CONVERT(date, GETDATE());

-- Mốc ngày demo gần nhất (loại SYNTH_HIST vì nó rải 90 ngày quá khứ)
DECLARE @SrcDay date;
SELECT @SrcDay = MAX(CONVERT(date, NgayThucHien))
FROM dbo.HangDoiPhongBan
WHERE ISNULL(NoiDungDaThucHien, N'') <> N'SYNTH_HIST';

IF @SrcDay IS NULL
BEGIN
    PRINT 'Không có data HangDoiPhongBan để refresh — bỏ qua.';
    RETURN;
END

DECLARE @Offset int = DATEDIFF(DAY, @SrcDay, @Today);

IF @Offset <> 0
BEGIN
    PRINT 'Dời data demo +' + CAST(@Offset AS varchar) + ' ngày (' +
          CONVERT(varchar, @SrcDay, 23) + ' → ' + CONVERT(varchar, @Today, 23) + ')';

    -- 1. HangDoiPhongBan — tất cả cột ngày.
    --    LOẠI TRỪ SYNTH_HIST: data train ML cố định trong quá khứ
    --    (90 ngày), KHÔNG dời ngày để giữ phân phối hourOfDay/dayOfWeek.
    UPDATE dbo.HangDoiPhongBan SET
        NgayThucHien    = DATEADD(DAY, @Offset, NgayThucHien),
        NgayGioLaySo    = DATEADD(DAY, @Offset, NgayGioLaySo),
        NgayGioThucHien = DATEADD(DAY, @Offset, NgayGioThucHien),
        NgayGioHoanTat  = DATEADD(DAY, @Offset, NgayGioHoanTat)
    WHERE CONVERT(date, NgayThucHien) <= @Today
      AND ISNULL(NoiDungDaThucHien, N'') <> N'SYNTH_HIST';
    PRINT '  HangDoiPhongBan: ' + CAST(@@ROWCOUNT AS varchar) + ' rows';

    -- 2. K_HangDoiTiepNhan — queue lấy số nhanh ở Quầy/Kiosk
    IF OBJECT_ID('dbo.K_HangDoiTiepNhan') IS NOT NULL
    BEGIN
        UPDATE dbo.K_HangDoiTiepNhan SET
            NgayGioBocSo           = DATEADD(DAY, @Offset, NgayGioBocSo),
            NgayGioTiepNhan        = DATEADD(DAY, @Offset, NgayGioTiepNhan),
            NgayGioHoanTatTiepNhan = DATEADD(DAY, @Offset, NgayGioHoanTatTiepNhan)
        WHERE NgayGioBocSo IS NOT NULL
          AND CONVERT(date, NgayGioBocSo) <= @Today;
        PRINT '  K_HangDoiTiepNhan: ' + CAST(@@ROWCOUNT AS varchar) + ' rows';
    END

    -- 3. TiepNhan — để CheckSoVaoVienVP "đã tiếp nhận trong ngày" đúng
    UPDATE dbo.TiepNhan SET
        NGAYTIEPNHAN     = DATEADD(DAY, @Offset, NGAYTIEPNHAN),
        THOIGIANTIEPNHAN = DATEADD(DAY, @Offset, THOIGIANTIEPNHAN)
    WHERE CONVERT(date, NGAYTIEPNHAN) <= @Today;
    PRINT '  TiepNhan: ' + CAST(@@ROWCOUNT AS varchar) + ' rows';

    -- 4. DichVuYeuCau — chỉ định CLS theo ngày
    UPDATE dbo.DichVuYeuCau SET
        NGAYYEUCAU    = DATEADD(DAY, @Offset, NGAYYEUCAU),
        NGAYGIOYEUCAU = DATEADD(DAY, @Offset, NGAYGIOYEUCAU),
        NAMYEUCAU     = YEAR(DATEADD(DAY, @Offset, NGAYGIOYEUCAU)),
        THANGYEUCAU   = MONTH(DATEADD(DAY, @Offset, NGAYGIOYEUCAU))
    WHERE CONVERT(date, NGAYYEUCAU) <= @Today;
    PRINT '  DichVuYeuCau: ' + CAST(@@ROWCOUNT AS varchar) + ' rows';
END
ELSE
BEGIN
    PRINT 'Data demo đã ở hôm nay (' + CONVERT(varchar, @Today, 23) + ') — không cần dời.';
END

-- 5. Chuẩn hoá thời gian chờ/phục vụ cho data demo (non-SYNTH) — LUÔN chạy,
--    idempotent (tính lại từ LaySo nên không tích luỹ qua các lần chạy).
--    Lý do: timestamp demo gốc lộn xộn (LaySo bị cụm về 1 thời điểm; nhiều
--    dòng NgayGioThucHien < NgayGioLaySo → wait ÂM; hoặc 50–60'). Dashboard
--    "Phân tích vận hành" tính chờ = LaySo→ThucHien nên hiển thị sai lệch.
--    Tính lại: ThucHien = LaySo + wait, HoanTat = ThucHien + serve theo phân
--    phối nền theo từng hàng đợi + jitter giả-ngẫu-nhiên ỔN ĐỊNH (CHECKSUM
--    theo Id) → wait ~5–20', serve ~1–13' (khớp data thật SYNTH_HIST).
--    GIỮ NGUYÊN: null-ness (BN đang chờ vẫn chờ, chưa hoàn tất vẫn chưa),
--    cột NgayThucHien (SP queue lọc theo ngày này), TinhTrang, Huy, STT.
--    KHÔNG đụng SYNTH_HIST (giữ tập train ML). Cùng ngày (wait+serve ≤ ~32').
;WITH norm AS (
    SELECT hd.NgayGioLaySo, hd.NgayGioThucHien, hd.NgayGioHoanTat,
           waitSec = (CASE hd.HangDoi_Id
                        WHEN 1 THEN 300 WHEN 3 THEN 540 WHEN 4 THEN 120
                        WHEN 5 THEN 180 WHEN 6 THEN 90 ELSE 480 END)
                     + ABS(CHECKSUM(hd.HangDoiPhongBan_Id) % 600),
           serveSec = (CASE hd.HangDoi_Id
                        WHEN 3 THEN 480 WHEN 4 THEN 120 WHEN 5 THEN 120
                        WHEN 6 THEN 60 ELSE 300 END)
                     + ABS(CHECKSUM(hd.HangDoiPhongBan_Id, hd.STT) % 300)
    FROM dbo.HangDoiPhongBan hd
    WHERE hd.NgayGioThucHien IS NOT NULL
      AND ISNULL(hd.NoiDungDaThucHien, N'') <> N'SYNTH_HIST'
      AND CONVERT(date, hd.NgayGioLaySo) <= @Today
)
UPDATE norm SET
    NgayGioThucHien = DATEADD(SECOND, waitSec, NgayGioLaySo),
    NgayGioHoanTat  = CASE WHEN NgayGioHoanTat IS NOT NULL
                           THEN DATEADD(SECOND, waitSec + serveSec, NgayGioLaySo)
                           ELSE NULL END;
PRINT '  Chuẩn hoá wait-time demo (non-SYNTH): ' + CAST(@@ROWCOUNT AS varchar) + ' rows';

PRINT 'OK: refresh demo về hôm nay xong';

-- Tóm tắt
SELECT HangDoi_Id, COUNT(*) AS Tong,
       SUM(CASE WHEN TinhTrang = 0 THEN 1 ELSE 0 END) AS Cho,
       SUM(CASE WHEN TinhTrang = 1 THEN 1 ELSE 0 END) AS DangGoi,
       SUM(CASE WHEN TinhTrang = 2 THEN 1 ELSE 0 END) AS HoanTat
FROM dbo.HangDoiPhongBan
WHERE NgayThucHien = CONVERT(date, GETDATE())
GROUP BY HangDoi_Id
ORDER BY HangDoi_Id;
GO
