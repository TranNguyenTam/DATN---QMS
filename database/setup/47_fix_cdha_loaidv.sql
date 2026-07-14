-- ════════════════════════════════════════════════════════════════
-- 47_fix_cdha_loaidv.sql
-- Fix: seed 46 chỉ gán LoaiDV='CDHA' cho nhóm X-Quang (2/7/8) → CT,
-- Siêu âm, Đo loãng xương, Điện tim bị gán 'Khac' → KHÔNG xuất hiện
-- trong dropdown "Chỉ định CLS/CDHA" của bác sĩ → không chỉ định được
-- dù queue CDHA có đủ phòng Siêu âm/CT/Đo loãng xương.
--
-- Gán lại LoaiDV='CDHA' + giá hợp lý cho các nhóm CĐHA còn thiếu.
-- Idempotent: UPDATE theo NHOMDICHVU_ID.
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO
USE QMS_DA;
GO

-- CT — nhom 14
UPDATE dbo.DM_DichVu SET LoaiDV = N'CDHA', DonGia = 800000, DonViTinh = N'Lần'
WHERE NHOMDICHVU_ID = 14 AND TAMNGUNG = 0;

-- MRI — nhom 15
UPDATE dbo.DM_DichVu SET LoaiDV = N'CDHA', DonGia = 1500000, DonViTinh = N'Lần'
WHERE NHOMDICHVU_ID = 15 AND TAMNGUNG = 0;

-- Siêu âm — nhom 16, 1024
UPDATE dbo.DM_DichVu SET LoaiDV = N'CDHA', DonGia = 200000, DonViTinh = N'Lần'
WHERE NHOMDICHVU_ID IN (16, 1024) AND TAMNGUNG = 0;

-- Đo loãng xương — nhom 1020
UPDATE dbo.DM_DichVu SET LoaiDV = N'CDHA', DonGia = 250000, DonViTinh = N'Lần'
WHERE NHOMDICHVU_ID = 1020 AND TAMNGUNG = 0;

-- Điện tim / Điện cơ — nhom 1018, 1028
UPDATE dbo.DM_DichVu SET LoaiDV = N'CDHA', DonGia = 150000, DonViTinh = N'Lần'
WHERE NHOMDICHVU_ID IN (1018, 1028) AND TAMNGUNG = 0;

-- X-Quang Tâm Trí / DV — nhom 7, 1027 (nếu có DV)
UPDATE dbo.DM_DichVu SET LoaiDV = N'CDHA', DonGia = 150000, DonViTinh = N'Lần'
WHERE NHOMDICHVU_ID IN (7, 1027) AND TAMNGUNG = 0;

PRINT 'OK: gán lại LoaiDV=CDHA cho CT/MRI/Siêu âm/Đo loãng xương/Điện tim';

-- Verify: số DV theo LoaiDV + breakdown CDHA theo nhóm
SELECT LoaiDV, SoDV = COUNT(*) FROM dbo.DM_DichVu
WHERE LoaiDV IS NOT NULL AND TAMNGUNG = 0
GROUP BY LoaiDV ORDER BY LoaiDV;

PRINT '--- CDHA breakdown theo nhóm ---';
SELECT n.TENNHOMDICHVU, SoDV = COUNT(*)
FROM dbo.DM_DichVu dv
JOIN dbo.DM_NhomDichVu n ON dv.NHOMDICHVU_ID = n.NHOMDICHVU_ID
WHERE dv.LoaiDV = N'CDHA' AND dv.TAMNGUNG = 0
GROUP BY n.TENNHOMDICHVU ORDER BY SoDV DESC;
GO

PRINT '════════════════════════════════════';
PRINT '   Fix CDHA LoaiDV done';
PRINT '════════════════════════════════════';
GO
