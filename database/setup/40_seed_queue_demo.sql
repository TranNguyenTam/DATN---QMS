-- ════════════════════════════════════════════════════════════════
-- 40_seed_queue_demo.sql
-- Sinh sample data cho HangDoiPhongBan để mọi screen module có data:
--   HangDoi 3 = Khu Khám Bệnh (đã có data từ Kiosk/TN)
--   HangDoi 4 = Thu Viện Phí → PhongBan 8
--   HangDoi 5 = Nhà Thuốc → PhongBan 9
--   HangDoi 6 = Lấy mẫu Xét Nghiệm → PhongBan 5
--   HangDoi 7 = Siêu Âm → PhongBan 6
--   HangDoi 8 = X Quang → PhongBan 7
--   HangDoi 9 = Đo loãng xương → PhongBan 10 (siêu âm 2)
--   HangDoi 10 = CT → PhongBan 10
--
-- Mỗi HangDoi seed 6 BN với 3 trạng thái:
--   - 3 BN chờ (TinhTrang=0)
--   - 2 BN đang gọi (TinhTrang=1)
--   - 1 BN đã hoàn tất (TinhTrang=2)
-- Idempotent: kiểm tra hôm nay đã có row demo chưa.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

DECLARE @Today date = CONVERT(date, GETDATE());
DECLARE @Now datetime = GETDATE();
DECLARE @Buoi nvarchar(10) = case when DATEPART(HOUR, GETDATE()) <= 11 then N'Sang' else N'Chieu' end;

-- Lấy 30 BN ngẫu nhiên có sẵn để gán vào queue
DECLARE @BenhNhanIds TABLE (Idx int IDENTITY(1,1) PRIMARY KEY, BenhNhan_Id int);
INSERT INTO @BenhNhanIds (BenhNhan_Id)
SELECT TOP 50 BenhNhan_Id
FROM dbo.BenhNhan
WHERE BenhNhan_Id IS NOT NULL
ORDER BY NEWID();

DECLARE @QueueConfig TABLE (
    HangDoi_Id int,
    PhongBan_Id int,
    NoiDungMau nvarchar(200)
);
INSERT INTO @QueueConfig VALUES
    (4, 8,  N'Thanh toán viện phí'),
    (5, 9,  N'Phát thuốc BHYT'),
    (6, 5,  N'Lấy mẫu xét nghiệm máu'),
    (7, 6,  N'Siêu âm ổ bụng tổng quát'),
    (8, 7,  N'X-Quang phổi thẳng'),
    (9, 10, N'Đo loãng xương'),
    (10, 10, N'CT-Scanner cột sống');

DECLARE @HangDoi_Id int, @PhongBan_Id int, @NoiDungMau nvarchar(200);
DECLARE @BnIdx int = 1;
DECLARE @KyTu nvarchar(10);

DECLARE cur CURSOR FOR SELECT HangDoi_Id, PhongBan_Id, NoiDungMau FROM @QueueConfig;
OPEN cur;
FETCH NEXT FROM cur INTO @HangDoi_Id, @PhongBan_Id, @NoiDungMau;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Skip nếu hôm nay đã có demo row (idempotent)
    IF NOT EXISTS (
        SELECT 1 FROM dbo.HangDoiPhongBan
        WHERE HangDoi_Id = @HangDoi_Id
          AND NgayThucHien = @Today
          AND NoiDungDaThucHien = N'SEED_DEMO'
    )
    BEGIN
        SELECT @KyTu = ISNULL(KyTuSTT, '') FROM dbo.DM_HangDoi WHERE HangDoi_Id = @HangDoi_Id;

        DECLARE @i int = 1;
        WHILE @i <= 6
        BEGIN
            DECLARE @BnId int;
            SELECT @BnId = BenhNhan_Id FROM @BenhNhanIds WHERE Idx = @BnIdx;
            IF @BnId IS NULL BEGIN SET @BnIdx = 1; SELECT @BnId = BenhNhan_Id FROM @BenhNhanIds WHERE Idx = @BnIdx; END
            SET @BnIdx = @BnIdx + 1;

            DECLARE @TinhTrang int = case
                when @i <= 3 then 0  -- chờ
                when @i <= 5 then 1  -- đang gọi
                else 2 end;           -- hoàn tất

            DECLARE @UuTien int = case when @i = 2 then 1 else 0 end;
            DECLARE @SttStr nvarchar(20) = @KyTu + RIGHT('000' + CONVERT(varchar(3), @i), 3);

            INSERT INTO dbo.HangDoiPhongBan (
                HangDoi_Id, PhongBan_Id, STT, SoThuTuDayDu, STTTheoLoaiPhongBan,
                UuTien, YeuCau, TinhTrang,
                NgayThucHien, NgayGioLaySo,
                BenhNhan_Id, LoaiPhieu, Huy,
                NoiDung, ThoiGian, BoQua, SoLuongChiDinh,
                ViTriHienTai, TinhTrangHienTai, Khoa,
                NoiDungDaThucHien
            )
            VALUES (
                @HangDoi_Id, @PhongBan_Id, @i, @SttStr, @i,
                @UuTien, 0, @TinhTrang,
                @Today, DATEADD(MINUTE, -@i * 5, @Now),
                @BnId, N'NgoaiTru', 0,
                @NoiDungMau, @Buoi, 0, 1,
                N'Khu chờ', case @TinhTrang when 0 then N'Đang chờ' when 1 then N'Đã gọi' else N'Hoàn tất' end, 0,
                N'SEED_DEMO'
            );

            SET @i = @i + 1;
        END

        PRINT 'Seeded queue HangDoi_Id=' + CAST(@HangDoi_Id AS varchar) + ' (6 rows)';
    END
    ELSE
        PRINT 'Skipped queue HangDoi_Id=' + CAST(@HangDoi_Id AS varchar) + ' (already has demo data)';

    FETCH NEXT FROM cur INTO @HangDoi_Id, @PhongBan_Id, @NoiDungMau;
END
CLOSE cur;
DEALLOCATE cur;

PRINT 'OK: queue seed done';

-- Tóm tắt
SELECT HangDoi_Id, COUNT(*) AS Tong,
       SUM(case when TinhTrang = 0 then 1 else 0 end) AS Cho,
       SUM(case when TinhTrang = 1 then 1 else 0 end) AS DangGoi,
       SUM(case when TinhTrang = 2 then 1 else 0 end) AS HoanTat
FROM dbo.HangDoiPhongBan
WHERE NgayThucHien = CONVERT(date, GETDATE())
GROUP BY HangDoi_Id
ORDER BY HangDoi_Id;
GO
