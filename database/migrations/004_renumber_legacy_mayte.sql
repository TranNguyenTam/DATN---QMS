-- 004_renumber_legacy_mayte.sql
-- Đổi mã y tế cũ KHÔNG thuần số (vd "B202606040001" — format lịch sử "B"+yyyyMMdd+seq)
-- sang dải SỐ eHospital = MAX(mã thuần số) + 1, để đồng bộ với BN clone từ HIS.
--
-- CASCADE sang các bảng tham chiếu MAYTE-by-value (PatientFaceEmbedding, FaceAuditLog)
-- để nhận diện khuôn mặt vẫn khớp với mã mới. Các bảng khác (TiepNhan, DichVuYeuCau,
-- HangDoiPhongBan, BHYT) tham chiếu BENHNHAN_ID nên KHÔNG bị ảnh hưởng.
--
-- Idempotent: chạy lại khi không còn mã không-số → no-op.
-- Apply (UTF-8 bắt buộc vì có tiếng Việt):
--   sqlcmd -S localhost\SQLEXPRESS -E -d QMS_DA -f 65001 -i database/migrations/004_renumber_legacy_mayte.sql

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;

DECLARE @base BIGINT = (
    SELECT ISNULL(MAX(TRY_CAST(MAYTE AS BIGINT)), 210000000) FROM dbo.BenhNhan
);

IF OBJECT_ID('tempdb..#map') IS NOT NULL DROP TABLE #map;

-- Map mã cũ (không thuần số) → mã mới (số tăng dần, > mọi mã hiện có nên không trùng).
SELECT BENHNHAN_ID,
       MAYTE AS OldMa,
       CAST(@base + ROW_NUMBER() OVER (ORDER BY BENHNHAN_ID) AS VARCHAR(64)) AS NewMa
INTO #map
FROM dbo.BenhNhan
WHERE MAYTE IS NOT NULL
  AND LEN(LTRIM(RTRIM(MAYTE))) > 0
  AND TRY_CAST(MAYTE AS BIGINT) IS NULL;   -- chỉ mã KHÔNG thuần số

-- 1) Bảng dữ liệu khuôn mặt (giữ liên kết enroll ↔ BN mới).
UPDATE pfe SET pfe.MaYTe = m.NewMa
FROM dbo.PatientFaceEmbedding pfe
JOIN #map m ON pfe.MaYTe = m.OldMa;

-- 2) Audit log (giữ lịch sử khớp mã mới).
UPDATE fal SET fal.MaYTe = m.NewMa
FROM dbo.FaceAuditLog fal
JOIN #map m ON fal.MaYTe = m.OldMa;

-- 3) Bảng BenhNhan (sau cùng).
UPDATE bn SET bn.MAYTE = m.NewMa
FROM dbo.BenhNhan bn
JOIN #map m ON bn.BENHNHAN_ID = m.BENHNHAN_ID;

-- In kết quả để đối chiếu (mã cũ → mã mới).
SELECT OldMa, NewMa FROM #map ORDER BY NewMa;
DROP TABLE #map;

COMMIT;
PRINT 'Done: legacy MAYTE renumbered to eHospital numeric range.';
