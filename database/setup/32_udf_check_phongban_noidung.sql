-- ════════════════════════════════════════════════════════════════
-- 32_udf_check_phongban_noidung.sql
-- UDF check_PhongBan_NoiDung — kiểm tra NoiDung có thuộc nhóm
-- "đặc biệt" của 1 PhongBan cụ thể không (DM_NoiDungDacBiet
-- filter theo PhongBan_Id). SP_002 dùng UDF này trong các action
-- SelectDanhSachHangDoiTheoHangDoiID + biến thể CLS/CDHA để
-- route BN vào đúng phòng.
--
-- Trả về:
--   - PhongBan_Id nếu NoiDung khớp pattern đặc biệt của PhongBan đó
--   - NULL nếu không khớp
-- ════════════════════════════════════════════════════════════════

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE QMS_DA;
GO

IF OBJECT_ID('dbo.check_PhongBan_NoiDung', 'FN') IS NOT NULL
    DROP FUNCTION dbo.check_PhongBan_NoiDung;
GO

CREATE FUNCTION dbo.check_PhongBan_NoiDung(
    @PhongBan_Id int,
    @LoaiPhieu nvarchar(50),
    @NoiDung nvarchar(max)
)
RETURNS int AS
BEGIN
    DECLARE @Match int = NULL;

    SELECT TOP 1 @Match = PhongBan_Id
    FROM dbo.DM_NoiDungDacBiet
    WHERE PhongBan_Id = @PhongBan_Id
      AND Huy = 0
      AND TamNgung = 0
      AND @NoiDung LIKE N'%' + TenNoiDung + N'%';

    RETURN @Match;
END;
GO

PRINT 'OK: UDF dbo.check_PhongBan_NoiDung created';
GO
