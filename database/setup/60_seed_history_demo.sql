-- ════════════════════════════════════════════════════════════════
-- 60_seed_history_demo.sql
-- Seed dữ liệu LỊCH SỬ (14 ngày qua) cho demo "nhiều dữ liệu, thật nhất":
--   • TiepNhan + HangDoiPhongBan (lượt khám HĐ3, đã hoàn tất)
--   • KB_BenhAn            → "Lịch sử khám bệnh"
--   • PatientFaceEmbedding → "Bệnh nhân đã đăng ký khuôn mặt"
--   • FaceAuditLog         → "Audit log khuôn mặt" (ENROLL + IDENTIFY)
-- + Gán phòng/hàng đợi CDHA cho KTV001 (sửa "Chưa gán phòng ban cho CDHA").
--
-- AN TOÀN:
--   • KHÔNG đụng dữ liệu HÔM NAY (queue demo do 41_refresh lo) và dữ liệu sẵn có.
--   • Idempotent: tag KB_BenhAn.GhiChu = '__SEED_HISTORY__'; chạy lại → bỏ qua.
--   • Atomic: SET XACT_ABORT ON + 1 transaction → lỗi giữa chừng rollback sạch.
--   • Embedding khuôn mặt là blob NGẪU NHIÊN (chỉ để HIỂN THỊ danh sách; KHÔNG
--     dùng để check-in được vì không phải embedding thật — backend bỏ qua khi match).
--
-- Apply (UTF-8 bắt buộc):
--   sqlcmd -S localhost\SQLEXPRESS -E -d QMS_DA -f 65001 -i database\setup\60_seed_history_demo.sql
-- ════════════════════════════════════════════════════════════════

-- QUOTED_IDENTIFIER/ANSI_NULLS ON bắt buộc để INSERT vào bảng có FILTERED INDEX
-- (PatientFaceEmbedding ... WHERE RevokedAt IS NULL). sqlcmd mặc định OFF → set ở
-- batch riêng để persist sang batch chính.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
USE QMS_DA;

-- ── 0. Gán phòng CDHA cho KTV001 (luôn chạy, idempotent) ──────────
--    PB6 Phòng Siêu Âm 1 + HD7 Siêu Âm → trang "Nhận & Gọi bệnh" CDHA dùng được.
INSERT INTO dbo.Sys_Users_PhongBan (User_Id, PhongBan_Id, HangDoi_Id)
SELECT u.User_Id, 6, 7
FROM dbo.Sys_Users u
WHERE u.UserCode = 'KTV001'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.Sys_Users_PhongBan s
    WHERE s.User_Id = u.User_Id AND s.PhongBan_Id = 6 AND s.HangDoi_Id = 7);

-- ── Guard idempotent cho phần seed lịch sử ──────────────────────
IF EXISTS (SELECT 1 FROM dbo.KB_BenhAn WHERE GhiChu = N'__SEED_HISTORY__')
BEGIN
    PRINT N'>> Đã seed lịch sử trước đó — bỏ qua phần lịch sử (chỉ chạy gán CDHA).';
    RETURN;
END;

BEGIN TRAN;

-- ── Dữ liệu nguồn ngẫu nhiên (bác sĩ / lý do / chẩn đoán / hướng ĐT) ──
DECLARE @doctors TABLE (id INT IDENTITY, name NVARCHAR(200));
INSERT INTO @doctors(name) VALUES
    (N'BS. Nguyễn Văn Hùng'),(N'BS. Trần Thị Mai'),
    (N'BS. Lê Quang Vinh'),(N'BS. Phạm Thị Hoa'),(N'BS. Đỗ Minh Khoa');

DECLARE @reasons TABLE (id INT IDENTITY, txt NVARCHAR(200));
INSERT INTO @reasons(txt) VALUES
    (N'Đau đầu, chóng mặt 3 ngày'),(N'Ho kéo dài, sốt nhẹ'),(N'Đau lưng, mỏi gối'),
    (N'Khó ngủ, người mệt mỏi'),(N'Đau dạ dày, ăn uống kém'),(N'Tê bì chân tay'),
    (N'Đau mỏi khớp vai gáy'),(N'Tăng huyết áp, tái khám');

DECLARE @dx TABLE (id INT IDENTITY, txt NVARCHAR(200), icd VARCHAR(20));
INSERT INTO @dx(txt,icd) VALUES
    (N'Rối loạn tiền đình','H81.3'),(N'Viêm họng cấp','J02'),
    (N'Thoái hóa cột sống thắt lưng','M47'),(N'Rối loạn giấc ngủ','G47.0'),
    (N'Viêm dạ dày','K29.7'),(N'Đau thần kinh tọa','M54.3'),(N'Tăng huyết áp','I10');

DECLARE @huong TABLE (id INT IDENTITY, txt NVARCHAR(300));
INSERT INTO @huong(txt) VALUES
    (N'Kê đơn thuốc, hẹn tái khám sau 7 ngày'),
    (N'Châm cứu + thuốc YHCT 5 ngày'),
    (N'Theo dõi tại nhà, tái khám khi cần'),
    (N'Tư vấn chế độ ăn, vận động');

-- Bệnh nhân nguồn: ACTIVE, mã thuần số (dải eHospital).
DECLARE @patients TABLE (rn INT IDENTITY, bnid INT, mayte NVARCHAR(64), ten NVARCHAR(200));
INSERT INTO @patients(bnid, mayte, ten)
SELECT TOP 80 BENHNHAN_ID, MAYTE, TENBENHNHAN
FROM dbo.BenhNhan
WHERE ACTIVE = '1' AND TRY_CAST(MAYTE AS BIGINT) IS NOT NULL
ORDER BY NEWID();
DECLARE @npat INT = (SELECT COUNT(*) FROM @patients);

IF @npat = 0
BEGIN
    ROLLBACK; PRINT N'Không có bệnh nhân nguồn — bỏ qua.'; RETURN;
END;

DECLARE @rooms TABLE (rn INT IDENTITY, pb INT);
INSERT INTO @rooms(pb) VALUES (2),(3),(4);  -- Phòng khám 1/2/3

-- ── Loop 14 ngày qua (1..14 ngày trước, KHÔNG gồm hôm nay) ───────
DECLARE @d INT = 1;
WHILE @d <= 14
BEGIN
    DECLARE @day DATE = DATEADD(DAY, -@d, CONVERT(date, GETDATE()));
    DECLARE @cnt INT = 8 + ABS(CHECKSUM(NEWID())) % 9;   -- 8..16 lượt/ngày
    DECLARE @i INT = 1;
    WHILE @i <= @cnt
    BEGIN
        -- Tính chỉ số ngẫu nhiên ra BIẾN trước (tránh NEWID() bị tính lại mỗi dòng
        -- trong WHERE → khớp nhiều dòng → lỗi "subquery returned more than 1 value").
        DECLARE @rp INT = 1 + ABS(CHECKSUM(NEWID())) % @npat;
        DECLARE @bnid INT, @mayte NVARCHAR(64), @ten NVARCHAR(200);
        SELECT @bnid = bnid, @mayte = mayte, @ten = ten FROM @patients WHERE rn = @rp;

        DECLARE @ridx INT = 1 + ABS(CHECKSUM(NEWID())) % 3;
        DECLARE @pb INT = (SELECT pb FROM @rooms WHERE rn = @ridx);

        DECLARE @didx INT = 1 + ABS(CHECKSUM(NEWID())) % 5;
        DECLARE @doc NVARCHAR(200) = (SELECT name FROM @doctors WHERE id = @didx);

        DECLARE @reidx INT = 1 + ABS(CHECKSUM(NEWID())) % 8;
        DECLARE @reason NVARCHAR(200) = (SELECT txt FROM @reasons WHERE id = @reidx);

        DECLARE @dxr INT = 1 + ABS(CHECKSUM(NEWID())) % 7;
        DECLARE @dxtxt NVARCHAR(200) = (SELECT txt FROM @dx WHERE id = @dxr);
        DECLARE @icd VARCHAR(20)     = (SELECT icd FROM @dx WHERE id = @dxr);

        DECLARE @hidx INT = 1 + ABS(CHECKSUM(NEWID())) % 4;
        DECLARE @huongtxt NVARCHAR(300) = (SELECT txt FROM @huong WHERE id = @hidx);

        DECLARE @hh INT = 7 + ABS(CHECKSUM(NEWID())) % 9;   -- 7h..15h
        DECLARE @mi INT = ABS(CHECKSUM(NEWID())) % 60;
        DECLARE @tnTime   DATETIME = DATEADD(MINUTE, @hh * 60 + @mi, CAST(@day AS DATETIME));
        DECLARE @khamTime DATETIME = DATEADD(MINUTE, 5 + ABS(CHECKSUM(NEWID())) % 40, @tnTime);
        DECLARE @hoanTime DATETIME = DATEADD(MINUTE, 8 + ABS(CHECKSUM(NEWID())) % 20, @khamTime);

        DECLARE @sotn   VARCHAR(30) = 'TN' + FORMAT(@day, 'yyMMdd') + RIGHT('000' + CAST(@i AS VARCHAR(4)), 4);
        DECLARE @sttStr VARCHAR(10) = RIGHT('000' + CAST(@i AS VARCHAR(4)), 4);
        DECLARE @uutien INT = CASE WHEN ABS(CHECKSUM(NEWID())) % 10 = 0 THEN 1 ELSE 0 END;
        DECLARE @dt     VARCHAR(10) = CASE WHEN ABS(CHECKSUM(NEWID())) % 3 = 0 THEN 'DV' ELSE 'BH80' END;

        -- 1) TiepNhan (đã hoàn tất)
        DECLARE @tnid INT;
        INSERT INTO dbo.TiepNhan
            (SOTIEPNHAN, SOTHUTU, BENHNHAN_ID, NOITIEPNHAN_ID,
             NGAYTIEPNHAN, NAMTIEPNHAN, THANGTIEPNHAN, THOIGIANTIEPNHAN,
             DOITUONG_ID, TRANGTHAI, LYDODENKHAM, LyDoKham, BacSiChiDinh, NGAYTAO, NGUOITAO_ID)
        VALUES
            (@sotn, @sttStr, @bnid, @pb,
             @tnTime, YEAR(@day), MONTH(@day), @tnTime,
             @dt, 'DONE', @reason, @reason, @doc, @tnTime, 1);
        SET @tnid = SCOPE_IDENTITY();

        -- 2) HangDoiPhongBan (HĐ3 Khám bệnh, TinhTrang=2 = đã khám xong)
        DECLARE @hdpb INT;
        INSERT INTO dbo.HangDoiPhongBan
            (HangDoi_Id, PhongBan_Id, STT, SoThuTuDayDu, UuTien, YeuCau, TinhTrang,
             NgayThucHien, NgayGioLaySo, NgayGioThucHien, NgayGioHoanTat,
             BenhNhan_Id, LoaiPhieu, Huy, BoQua, NoiDung, ThoiGian, SoLuongChiDinh,
             ViTriHienTai, TinhTrangHienTai, Khoa)
        VALUES
            (3, @pb, @i, RIGHT('00' + CAST(@i AS VARCHAR(3)), 3), @uutien, 0, 2,
             @day, @tnTime, @khamTime, @hoanTime,
             @bnid, 'NgoaiTru', 0, 0, N'Tiếp nhận #' + @sotn,
             CASE WHEN @hh <= 11 THEN 'Sang' ELSE 'Chieu' END, 1,
             N'Khu Khám Bệnh', N'Đã khám', 0);
        SET @hdpb = SCOPE_IDENTITY();

        -- 3) KB_BenhAn (lịch sử khám) — tag GhiChu để idempotent
        INSERT INTO dbo.KB_BenhAn
            (TiepNhan_Id, BenhNhan_Id, HangDoiPhongBan_Id, BacSi_Id, TenBacSi,
             NgayKham, LyDoKham, TrieuChung, ChanDoan, ChanDoanICD, HuongDieuTri,
             GhiChu, NgayTao, NguoiTao_Id)
        VALUES
            (@tnid, @bnid, @hdpb, 1, @doc,
             @khamTime, @reason, @reason, @dxtxt, @icd, @huongtxt,
             N'__SEED_HISTORY__', @khamTime, 1);

        SET @i = @i + 1;
    END;
    SET @d = @d + 1;
END;

-- ── PatientFaceEmbedding: ~24 BN đã đăng ký khuôn mặt ───────────
--    Blob ngẫu nhiên (~2076 byte) — CHỈ để hiển thị danh sách đã đăng ký.
DECLARE @faceP TABLE (rn INT IDENTITY, mayte NVARCHAR(64), ten NVARCHAR(200), enrAt DATETIME2(0));
INSERT INTO @faceP(mayte, ten, enrAt)
SELECT TOP 24 MAYTE, TENBENHNHAN,
       DATEADD(DAY, -(1 + ABS(CHECKSUM(NEWID())) % 20), CAST(GETDATE() AS DATETIME2(0)))
FROM dbo.BenhNhan
WHERE ACTIVE = '1' AND TRY_CAST(MAYTE AS BIGINT) IS NOT NULL
  AND MAYTE NOT IN (SELECT MaYTe FROM dbo.PatientFaceEmbedding)  -- né trùng BN đã enroll thật
ORDER BY NEWID();

INSERT INTO dbo.PatientFaceEmbedding (MaYTe, HoTen, ModelName, EmbeddingEnc, KeyId, EnrolledAt, EnrolledBy)
SELECT mayte, ten, N'Facenet512', CRYPT_GEN_RANDOM(2076), N'dev-v1', enrAt, 1
FROM @faceP;
-- Thêm ảnh thứ 2 cho ~1/3 (multi-image, vẫn ≤5 active)
INSERT INTO dbo.PatientFaceEmbedding (MaYTe, HoTen, ModelName, EmbeddingEnc, KeyId, EnrolledAt, EnrolledBy)
SELECT mayte, ten, N'Facenet512', CRYPT_GEN_RANDOM(2076), N'dev-v1',
       DATEADD(MINUTE, 2, enrAt), 1
FROM @faceP WHERE rn % 3 = 0;

-- ── FaceAuditLog: ENROLL (theo từng embedding) + IDENTIFY (qua 14 ngày) ──
-- ENROLL: 1 dòng/embedding vừa seed
INSERT INTO dbo.FaceAuditLog (Action, MaYTe, UserId, Result, Confidence, Message, ClientIp, UserAgent, CreatedAt)
SELECT N'ENROLL', pfe.MaYTe, 1, N'SUCCESS', NULL,
       N'id=' + CAST(pfe.Id AS NVARCHAR(20)), '::1', N'Mozilla/5.0 (Kiosk)',
       DATEADD(SECOND, ABS(CHECKSUM(NEWID())) % 120, pfe.EnrolledAt)
FROM dbo.PatientFaceEmbedding pfe
JOIN @faceP f ON f.mayte = pfe.MaYTe;

-- IDENTIFY thành công (~110 dòng): khớp BN, confidence 0.62..0.98
;WITH tally AS (
    SELECT TOP 110 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects
)
INSERT INTO dbo.FaceAuditLog (Action, MaYTe, UserId, Result, Confidence, Message, ClientIp, UserAgent, CreatedAt)
SELECT N'IDENTIFY', p.mayte, 1, N'SUCCESS',
       ROUND(0.62 + (ABS(CHECKSUM(NEWID())) % 37) / 100.0, 4), NULL,
       '::1', N'Mozilla/5.0 (Kiosk)',
       DATEADD(MINUTE, -(ABS(CHECKSUM(NEWID())) % (14 * 24 * 60)), CAST(GETDATE() AS DATETIME2(0)))
FROM tally t
CROSS APPLY (SELECT TOP 1 mayte FROM @faceP ORDER BY NEWID()) p;

-- IDENTIFY thất bại (~25 dòng): không khớp ai, confidence thấp
;WITH tally AS (
    SELECT TOP 25 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects
)
INSERT INTO dbo.FaceAuditLog (Action, MaYTe, UserId, Result, Confidence, Message, ClientIp, UserAgent, CreatedAt)
SELECT N'IDENTIFY', NULL, 1, N'FAIL',
       ROUND(0.30 + (ABS(CHECKSUM(NEWID())) % 30) / 100.0, 4),
       N'Không khớp (dưới ngưỡng)', '::1', N'Mozilla/5.0 (Kiosk)',
       DATEADD(MINUTE, -(ABS(CHECKSUM(NEWID())) % (14 * 24 * 60)), CAST(GETDATE() AS DATETIME2(0)))
FROM tally t;

DECLARE @nBA INT = (SELECT COUNT(*) FROM dbo.KB_BenhAn WHERE GhiChu = N'__SEED_HISTORY__');
DECLARE @nFace INT = (SELECT COUNT(*) FROM @faceP);
DECLARE @nAudit INT = (SELECT COUNT(*) FROM dbo.FaceAuditLog);

COMMIT;

PRINT N'════════════════════════════════════';
PRINT N'  Seed history done:';
PRINT N'   - KB_BenhAn (lịch sử khám):  ' + CAST(@nBA AS NVARCHAR(10));
PRINT N'   - BN đăng ký khuôn mặt:      ' + CAST(@nFace AS NVARCHAR(10));
PRINT N'   - FaceAuditLog (tổng):       ' + CAST(@nAudit AS NVARCHAR(10));
PRINT N'════════════════════════════════════';
GO
