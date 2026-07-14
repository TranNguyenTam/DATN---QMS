-- ════════════════════════════════════════════════════════════════
-- 42_seed_synthetic_history.sql
-- Sinh ~20.000 lượt phục vụ LỊCH SỬ (đã hoàn tất) vào
-- dbo.HangDoiPhongBan để train model dự báo thời gian chờ.
--
-- Data có QUY LUẬT học được (không random thuần):
--   - Trải 90 ngày gần nhất, bỏ Chủ Nhật.
--   - Phân bố giờ theo cao điểm: sáng 7–11h đông nhất.
--   - 7 hàng đợi với số quầy (server) + service-time khác nhau.
--   - waitMinutes = baseService
--        + (queueAhead / servers) * baseService * peakFactor * priorityFactor
--        + nhiễu Gaussian (xấp xỉ qua tổng 3 uniform — CLT).
--   - BN ưu tiên (~8%) chờ ít hơn ~45%.
--
-- => model học được quan hệ (queueLen, hourOfDay, dayOfWeek,
--    queueType, priority) → waitMinutes.
--
-- Đánh dấu NoiDungDaThucHien = N'SYNTH_HIST' để:
--   - 41_refresh_demo_today.sql KHÔNG dời ngày (giữ phân phối thời gian).
--   - Phân biệt với data demo (SEED_DEMO) + tiếp nhận thật.
--
-- Idempotent: xoá SYNTH_HIST cũ trước khi sinh lại.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

PRINT 'Xoá synthetic history cũ...';
DELETE FROM dbo.HangDoiPhongBan WHERE NoiDungDaThucHien = N'SYNTH_HIST';

DECLARE @Today date = CONVERT(date, GETDATE());
DECLARE @N int = 20000;

-- ── Cấu hình hàng đợi: server (số quầy), baseService (phút), trọng số volume
DECLARE @Q TABLE (
    HangDoi_Id int, PhongBan_Id int, Servers int,
    BaseSvc float, Weight int, NoiDung nvarchar(100)
);
INSERT INTO @Q VALUES
    (3, 2, 3, 10.0, 50, N'Khám bệnh'),
    (4, 8, 2, 4.0, 18, N'Thanh toán viện phí'),
    (5, 9, 2, 5.0, 14, N'Phát thuốc BHYT'),
    (6, 5, 2, 3.0, 8,  N'Lấy mẫu xét nghiệm'),
    (7, 6, 1, 15.0, 4, N'Siêu âm ổ bụng'),
    (8, 7, 1, 8.0, 4,  N'X-Quang phổi'),
    (10,10,1, 20.0, 2, N'CT-Scanner');

-- Bảng cộng dồn trọng số để random hàng đợi theo phân phối
DECLARE @QW TABLE (
    HangDoi_Id int, PhongBan_Id int, Servers int, BaseSvc float,
    NoiDung nvarchar(100), Lo int, Hi int
);
;WITH cw AS (
    SELECT *,
           Hi = SUM(Weight) OVER (ORDER BY HangDoi_Id),
           Lo = SUM(Weight) OVER (ORDER BY HangDoi_Id)
                - Weight
    FROM @Q
)
INSERT INTO @QW
SELECT HangDoi_Id, PhongBan_Id, Servers, BaseSvc, NoiDung, Lo, Hi FROM cw;

DECLARE @TotW int = (SELECT SUM(Weight) FROM @Q);

-- ── Danh sách BN để gán ngẫu nhiên
DECLARE @BN TABLE (rn int IDENTITY(1,1) PRIMARY KEY, BenhNhan_Id int);
INSERT INTO @BN (BenhNhan_Id) SELECT BenhNhan_Id FROM dbo.BenhNhan;
DECLARE @BNcnt int = (SELECT COUNT(*) FROM @BN);

PRINT 'Sinh ' + CAST(@N AS varchar) + ' lượt...';

;WITH tally AS (
    SELECT TOP (@N) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
),
rnd AS (
    SELECT i,
        r1 = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % 100000 / 100000.0,
        r2 = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % 100000 / 100000.0,
        r3 = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % 100000 / 100000.0,
        r4 = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % 100000 / 100000.0,
        r5 = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % 100000 / 100000.0,
        r6 = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % 100000 / 100000.0,
        wpick = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % (SELECT SUM(Weight) FROM @Q),
        bnpick = ABS(CAST(CHECKSUM(NEWID()) AS bigint)) % (SELECT COUNT(*) FROM @BN) + 1
    FROM tally
),
base AS (
    SELECT
        rnd.i,
        q.HangDoi_Id, q.PhongBan_Id, q.Servers, q.BaseSvc, q.NoiDung,
        bn.BenhNhan_Id,
        -- ngày: lùi 1..90 ngày, bỏ Chủ Nhật (nếu CN thì lùi thêm 1)
        TheDay = CASE
            WHEN DATENAME(WEEKDAY, DATEADD(DAY, -(1 + CAST(rnd.r1 * 89 AS int)), @Today)) = 'Sunday'
                THEN DATEADD(DAY, -(2 + CAST(rnd.r1 * 89 AS int)), @Today)
            ELSE DATEADD(DAY, -(1 + CAST(rnd.r1 * 89 AS int)), @Today)
        END,
        -- giờ đến: phân phối cao điểm sáng. r2 nhỏ → sáng sớm
        ArrHour = CASE
            WHEN rnd.r2 < 0.40 THEN 7  + CAST(rnd.r3 * 3 AS int)   -- 7-9h  (40%)
            WHEN rnd.r2 < 0.62 THEN 9  + CAST(rnd.r3 * 2 AS int)   -- 9-11h (22%)
            WHEN rnd.r2 < 0.72 THEN 11                              -- 11h   (10%)
            WHEN rnd.r2 < 0.90 THEN 13 + CAST(rnd.r3 * 2 AS int)   -- 13-15h(18%)
            ELSE 15 + CAST(rnd.r3 * 2 AS int)                       -- 15-17h(10%)
        END,
        ArrMin = CAST(rnd.r4 * 60 AS int),
        ArrSec = CAST(rnd.r5 * 60 AS int),
        UuTien = CASE WHEN rnd.r6 < 0.08 THEN 1 ELSE 0 END,
        SvcJitter = 0.7 + rnd.r3 * 0.6,         -- service-time biến thiên 0.7–1.3×
        Noise = (rnd.r4 + rnd.r5 + rnd.r6 - 1.5) * 8.0  -- ~N(0, ~3.3) phút
    FROM rnd
    JOIN @QW q ON rnd.wpick >= q.Lo AND rnd.wpick < q.Hi
    JOIN @BN bn ON bn.rn = rnd.bnpick
),
arr AS (
    SELECT *,
        TakeTime = DATEADD(SECOND, ArrSec,
                   DATEADD(MINUTE, ArrMin,
                   DATEADD(HOUR, ArrHour, CAST(TheDay AS datetime)))),
        PeakFactor = CASE
            WHEN ArrHour BETWEEN 7 AND 8  THEN 1.40
            WHEN ArrHour BETWEEN 9 AND 10 THEN 1.20
            WHEN ArrHour = 11             THEN 0.80
            WHEN ArrHour BETWEEN 13 AND 14 THEN 1.10
            ELSE 0.90
        END,
        PrioFactor = CASE WHEN UuTien = 1 THEN 0.55 ELSE 1.00 END
    FROM base
),
seq AS (
    SELECT *,
        -- vị trí trong CỬA SỔ GIỜ (giả định queue được giải toả dần
        -- theo giờ) — sát thực tế hơn là tích luỹ cả ngày
        PosInHour = ROW_NUMBER() OVER (
            PARTITION BY TheDay, HangDoi_Id, ArrHour
            ORDER BY TakeTime, i) - 1
    FROM arr
),
calc AS (
    SELECT *,
        SvcMin = BaseSvc * SvcJitter,
        WaitMin =
            -- chờ ≈ số "lượt phục vụ" phía trước (chia đều cho số quầy)
            -- nhân service-time, điều biến nhẹ theo cao điểm + ưu tiên
            ( BaseSvc
              + FLOOR(PosInHour * 1.0 / Servers)
                * BaseSvc * (0.85 + (PeakFactor - 1.0) * 0.5) * PrioFactor
              + Noise )
    FROM seq
),
fin AS (
    SELECT *,
        WaitClamped = CASE
            WHEN WaitMin < 2   THEN 2
            WHEN WaitMin > 180 THEN 180
            ELSE WaitMin END
    FROM calc
)
INSERT INTO dbo.HangDoiPhongBan (
    HangDoi_Id, PhongBan_Id, STT, SoThuTuDayDu, STTTheoLoaiPhongBan,
    UuTien, YeuCau, TinhTrang,
    NgayThucHien, NgayGioLaySo, NgayGioThucHien, NgayGioHoanTat,
    BenhNhan_Id, LoaiPhieu, Huy, BoQua,
    NoiDung, ThoiGian, SoLuongChiDinh,
    ViTriHienTai, TinhTrangHienTai, Khoa, NoiDungDaThucHien, LoaiUuTien
)
SELECT
    HangDoi_Id, PhongBan_Id,
    STT = PosInHour + 1,
    SoThuTuDayDu = RIGHT('000' + CAST(PosInHour + 1 AS varchar(4)), 4),
    STTTheoLoaiPhongBan = PosInHour + 1,
    UuTien, 0, 2,                                    -- TinhTrang=2 (hoàn tất)
    CONVERT(date, TheDay),
    TakeTime,
    TakeTime,                                        -- ThucHien: set lại ở UPDATE bên dưới
    DATEADD(MINUTE, CAST(WaitClamped AS int), TakeTime),
    BenhNhan_Id, N'NgoaiTru', 0, 0,
    NoiDung,
    CASE WHEN ArrHour <= 11 THEN N'Sang' ELSE N'Chieu' END,
    1,
    N'Khu chờ', N'Hoàn tất', 0, N'SYNTH_HIST',
    CASE WHEN UuTien = 1 THEN N'Người cao tuổi' ELSE NULL END
FROM fin;

-- Đặt NgayGioThucHien hợp lý: nằm giữa LaySo và HoanTat (≈ 60% quãng chờ)
UPDATE dbo.HangDoiPhongBan
SET NgayGioThucHien = DATEADD(
        SECOND,
        CAST(DATEDIFF(SECOND, NgayGioLaySo, NgayGioHoanTat) * 0.6 AS int),
        NgayGioLaySo)
WHERE NoiDungDaThucHien = N'SYNTH_HIST';

DECLARE @ins int = (SELECT COUNT(*) FROM dbo.HangDoiPhongBan WHERE NoiDungDaThucHien = N'SYNTH_HIST');
PRINT 'OK: đã sinh ' + CAST(@ins AS varchar) + ' lượt synthetic history';

-- Tóm tắt phân phối
SELECT HangDoi_Id,
       SoLuot = COUNT(*),
       WaitTB_phut = AVG(DATEDIFF(MINUTE, NgayGioLaySo, NgayGioHoanTat)),
       WaitMin_ = MIN(DATEDIFF(MINUTE, NgayGioLaySo, NgayGioHoanTat)),
       WaitMax_ = MAX(DATEDIFF(MINUTE, NgayGioLaySo, NgayGioHoanTat)),
       UuTien_ = SUM(UuTien)
FROM dbo.HangDoiPhongBan
WHERE NoiDungDaThucHien = N'SYNTH_HIST'
GROUP BY HangDoi_Id
ORDER BY HangDoi_Id;
GO
