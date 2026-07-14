-- ════════════════════════════════════════════════════════════════
-- 46_his_light_seed.sql
-- Seed giá + loại cho DM_DichVu hiện có + 15 thuốc YHCT mẫu.
-- Idempotent: dùng UPDATE WHERE, INSERT WHERE NOT EXISTS.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

-- ── A. Gán LoaiDV + DonGia + DonViTinh cho DM_DichVu hiện có ──

-- Khám bệnh: NhomDichVu_Id=5 = "Khám bệnh"
UPDATE dbo.DM_DichVu
SET LoaiDV = N'KhamBenh', DonGia = ISNULL(DonGia, 100000), DonViTinh = ISNULL(DonViTinh, N'Lần')
WHERE NHOMDICHVU_ID = 5 AND TAMNGUNG = 0;

-- XN: NhomDichVu_Id IN (1,9,10) — Xét nghiệm / Vi sinh / Hóa sinh
UPDATE dbo.DM_DichVu
SET LoaiDV = N'CLS', DonGia = ISNULL(DonGia, 80000), DonViTinh = ISNULL(DonViTinh, N'Lần')
WHERE NHOMDICHVU_ID IN (1, 9, 10) AND TAMNGUNG = 0;

-- CDHA: tất cả nhóm chẩn đoán hình ảnh — X-Quang (2/7/8/1027),
-- Siêu âm (16/1024), CT (14), MRI (15), Đo loãng xương (1020),
-- Điện tim/Điện cơ (1018/1028). Phải đủ các nhóm này thì bác sĩ mới
-- chỉ định được + BN nhảy đúng queue Siêu âm/CT/Đo loãng xương.
UPDATE dbo.DM_DichVu
SET LoaiDV = N'CDHA',
    DonGia = ISNULL(DonGia,
                CASE
                    WHEN NHOMDICHVU_ID = 14 THEN 800000             -- CT
                    WHEN NHOMDICHVU_ID = 15 THEN 1500000            -- MRI
                    WHEN NHOMDICHVU_ID IN (16, 1024) THEN 200000    -- Siêu âm
                    WHEN NHOMDICHVU_ID = 1020 THEN 250000           -- Đo loãng xương
                    WHEN NHOMDICHVU_ID IN (1018, 1028) THEN 150000  -- Điện tim/cơ
                    WHEN TENDICHVU LIKE N'%CT%' OR TENDICHVU LIKE N'%cắt lớp%' THEN 800000
                    WHEN TENDICHVU LIKE N'%MRI%' OR TENDICHVU LIKE N'%cộng hưởng%' THEN 1500000
                    WHEN TENDICHVU LIKE N'%siêu âm%' OR TENDICHVU LIKE N'%Siêu âm%' THEN 200000
                    WHEN TENDICHVU LIKE N'%đo loãng%' OR TENDICHVU LIKE N'%Đo loãng%' THEN 250000
                    ELSE 150000  -- X-Quang mặc định
                END),
    DonViTinh = ISNULL(DonViTinh, N'Lần')
WHERE NHOMDICHVU_ID IN (2, 7, 8, 14, 15, 16, 1018, 1020, 1024, 1027, 1028)
  AND TAMNGUNG = 0;

-- Còn lại — Thủ thuật / Phẫu thuật / Tiền giường: gán LoaiDV='Khac'
UPDATE dbo.DM_DichVu
SET LoaiDV = N'Khac', DonGia = ISNULL(DonGia, 50000), DonViTinh = ISNULL(DonViTinh, N'Lần')
WHERE LoaiDV IS NULL AND TAMNGUNG = 0;

PRINT 'OK: gán LoaiDV + DonGia cho DM_DichVu hiện có';

-- ── B. Tạo nhóm "Thuốc" nếu chưa có ───────────────────────────

DECLARE @ThuocNhomId int;
SELECT @ThuocNhomId = NHOMDICHVU_ID FROM dbo.DM_NhomDichVu WHERE TENNHOMDICHVU = N'Thuốc YHCT';
IF @ThuocNhomId IS NULL
BEGIN
    DECLARE @NextNhomId int = (SELECT ISNULL(MAX(NHOMDICHVU_ID), 0) + 1 FROM dbo.DM_NhomDichVu);
    DECLARE @LoaiDvId int = (SELECT TOP 1 LOAIDICHVU_ID FROM dbo.DM_NhomDichVu WHERE LOAIDICHVU_ID IS NOT NULL);
    SET @LoaiDvId = ISNULL(@LoaiDvId, 1);
    INSERT INTO dbo.DM_NhomDichVu (NHOMDICHVU_ID, MANHOMDICHVU, LOAIDICHVU_ID, TENNHOMDICHVU, CAP)
    VALUES (@NextNhomId, 'THUOCYHCT', @LoaiDvId, N'Thuốc YHCT', 1);
    SET @ThuocNhomId = @NextNhomId;
    PRINT 'OK: tạo NhomDichVu Thuốc YHCT với Id=' + CAST(@ThuocNhomId AS varchar);
END

-- ── C. Insert 15 thuốc YHCT mẫu (nếu chưa có) ──────────────────

DECLARE @StartDvId int = (SELECT ISNULL(MAX(DICHVU_ID), 0) + 1 FROM dbo.DM_DichVu);

-- Bảng tạm chứa danh sách thuốc
DECLARE @Thuoc TABLE (
    Idx int IDENTITY(1,1),
    Ten nvarchar(300),
    DonVi nvarchar(30),
    Gia numeric(18,2)
);
INSERT INTO @Thuoc (Ten, DonVi, Gia) VALUES
    (N'Hoạt huyết dưỡng não', N'Viên', 2500),
    (N'An thần bổ tâm', N'Viên', 3000),
    (N'Bổ trung ích khí', N'Viên', 2800),
    (N'Lục vị địa hoàng', N'Viên', 3200),
    (N'Tỳ bà diệp lộ', N'Chai', 35000),
    (N'Bổ phế chỉ ho', N'Viên', 2200),
    (N'Cao ích mẫu', N'Hộp', 45000),
    (N'Cao xương rồng tía', N'Hộp', 55000),
    (N'Rượu thuốc xoa bóp', N'Chai', 80000),
    (N'Cao dán giảm đau YHCT', N'Miếng', 15000),
    (N'Trà giảm cân thanh nhiệt', N'Gói', 12000),
    (N'Viên nén kim tiền thảo', N'Viên', 1800),
    (N'Cao nhân sâm tam thất', N'Lọ', 250000),
    (N'Hoàn an cung ngưu hoàng', N'Viên', 350000),
    (N'Nghệ đen mật ong', N'Lọ', 95000);

DECLARE @i int = 1, @cnt int = (SELECT COUNT(*) FROM @Thuoc);
DECLARE @ten nvarchar(300), @donvi nvarchar(30), @gia numeric(18,2), @ma varchar(20);

WHILE @i <= @cnt
BEGIN
    SELECT @ten = Ten, @donvi = DonVi, @gia = Gia FROM @Thuoc WHERE Idx = @i;

    IF NOT EXISTS (SELECT 1 FROM dbo.DM_DichVu WHERE TENDICHVU = @ten AND LoaiDV = N'Thuoc')
    BEGIN
        SET @ma = 'T' + RIGHT('00000' + CAST(@StartDvId AS varchar(6)), 6);
        INSERT INTO dbo.DM_DichVu (DICHVU_ID, MADICHVU, CAP, TENDICHVU, NHOMDICHVU_ID, TAMNGUNG, DonGia, DonViTinh, LoaiDV)
        VALUES (@StartDvId, @ma, 1, @ten, @ThuocNhomId, 0, @gia, @donvi, N'Thuoc');
        SET @StartDvId = @StartDvId + 1;
    END

    SET @i = @i + 1;
END

PRINT 'OK: seed thuốc xong';

-- ── D. Verify ──────────────────────────────────────────────────

SELECT LoaiDV, SoDichVu = COUNT(*), GiaTB = AVG(DonGia)
FROM dbo.DM_DichVu
WHERE LoaiDV IS NOT NULL AND TAMNGUNG = 0
GROUP BY LoaiDV
ORDER BY LoaiDV;

GO
PRINT '════════════════════════════════════';
PRINT '   HIS-light seed done';
PRINT '════════════════════════════════════';
GO
