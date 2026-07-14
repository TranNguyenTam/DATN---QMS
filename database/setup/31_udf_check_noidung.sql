-- ════════════════════════════════════════════════════════════════
-- 31_udf_check_noidung.sql
-- UDF check_NoiDung — kiểm tra nội dung có thuộc nhóm "đặc biệt" của
-- 1 HangDoi không (dựa trên DM_NoiDungDacBiet). SP_002 dùng UDF này
-- trong action ChayChuDanhSachChoNew + SelectDanhSachHangDoiTheoHangDoiID.
--
-- Source: K_QMS_YHCT.dbo.check_NoiDung (clone từ DB công ty).
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

IF OBJECT_ID('dbo.check_NoiDung', 'FN') IS NOT NULL
    DROP FUNCTION dbo.check_NoiDung;
GO

CREATE FUNCTION dbo.check_NoiDung(
    @HangDoi_Id int,
    @NoiDung nvarchar(max)
)
RETURNS int AS
BEGIN
    DECLARE @DacBiet as int;

    SELECT @DacBiet = ISNULL(SUM(DacBiet), 0)
    FROM (
        SELECT
            DacBiet = CASE
                WHEN @NoiDung LIKE N'%' + TenNoiDung + N'%' THEN 1
                ELSE 0
            END
        FROM (
            SELECT TenNoiDung
            FROM dbo.DM_NoiDungDacBiet
            WHERE HangDoi_Id = @HangDoi_Id
              AND Huy = 0
              AND TamNgung = 0
        ) A
    ) B;

    RETURN @DacBiet;
END;
GO

PRINT 'OK: UDF dbo.check_NoiDung created';
GO
