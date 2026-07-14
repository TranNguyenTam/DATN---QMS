using System.Transactions;
using Qms.Core.DTOs;
using Qms.Core.Exceptions;
using Qms.Infrastructure.Utils;

namespace Qms.API.Services;

/// <summary>
/// Inline-SQL service (Dapper) cho EMR-light: BenhNhan + BHYT + TiepNhan + DichVuYeuCau.
/// Lưu ý:
///  - BenhNhan.BENHNHAN_ID KHÔNG IDENTITY → tự sinh = MAX+1.
///  - TiepNhan.TIEPNHAN_ID + DichVuYeuCau.DVYEUCAU_ID IDENTITY → để DB cấp.
///  - MAYTE: sinh đồng nhất dải eHospital = MAX(mã thuần số) + 1 (vd "210009xxx").
///    (Lịch sử: từng dùng "B"+yyyyMMdd+seq → đã bỏ để đồng bộ; BN mã "B2026..." là
///     dữ liệu tạo TRƯỚC khi đổi, không phải bug của code hiện tại.)
///  - SOTIEPNHAN format: "TN" + yyMMdd + 4-digit sequence (vd "TN2605120001").
///  - SOPHIEUYEUCAU format: "P" + yyMMdd + 4-digit sequence trong ngày.
/// </summary>
public class EmrService : IEmrService
{
    private readonly IDatabaseHelper _db;
    private readonly ILogger<EmrService> _log;

    public EmrService(IDatabaseHelper db, ILogger<EmrService> log)
    {
        _db = db;
        _log = log;
    }

    // ── 1. Danh mục đối tượng ─────────────────────────────────────

    public Task<IEnumerable<dynamic>> GetDanhMucDoiTuongAsync()
        => _db.ListAsync(@"
SELECT DoiTuong_Id AS DoiTuongId,
       Ma,
       TenDoiTuong,
       TYLE_BHYT AS TyLeBhyt,
       BHYT_5NAM AS Bhyt5Nam
FROM dbo.DM_DoiTuong
WHERE (Huy IS NULL OR Huy = 0)
ORDER BY Ma");

    // ── 2. Search dịch vụ ─────────────────────────────────────────

    public Task<IEnumerable<dynamic>> SearchDichVuAsync(string? q, int limit = 20)
    {
        if (limit <= 0 || limit > 100) limit = 20;
        var kw = (q ?? "").Trim();
        if (kw.Length == 0)
        {
            return _db.ListAsync(@"
SELECT TOP (@Lim) DICHVU_ID AS DichVuId, MADICHVU AS MaDichVu, TENDICHVU AS TenDichVu,
       DONVITINH AS DonViTinh, BHYT, THOIGIANTHUCHIEN AS ThoiGianThucHien
FROM dbo.DM_DichVu
WHERE (TAMNGUNG IS NULL OR TAMNGUNG <> '1')
ORDER BY MADICHVU", new { Lim = limit });
        }

        var like = $"%{kw}%";
        return _db.ListAsync(@"
SELECT TOP (@Lim) DICHVU_ID AS DichVuId, MADICHVU AS MaDichVu, TENDICHVU AS TenDichVu,
       DONVITINH AS DonViTinh, BHYT, THOIGIANTHUCHIEN AS ThoiGianThucHien
FROM dbo.DM_DichVu
WHERE (TAMNGUNG IS NULL OR TAMNGUNG <> '1')
  AND (TENDICHVU LIKE @Like OR MADICHVU LIKE @Like OR TENKHONGDAU LIKE @Like)
ORDER BY
    CASE WHEN MADICHVU LIKE @Like THEN 0 ELSE 1 END,
    MADICHVU",
            new { Lim = limit, Like = like });
    }

    // ── 3. Get BN by MAYTE (kèm BHYT mới nhất) ────────────────────

    public async Task<dynamic?> GetBenhNhanByMaYTeAsync(string maYTe)
    {
        var bn = await _db.OneAsync(@"
SELECT BENHNHAN_ID AS BenhNhanId, MAYTE, TENBENHNHAN AS TenBenhNhan,
       GIOITINH AS GioiTinh, NGAYSINH AS NgaySinh, NAMSINH AS NamSinh,
       SODIENTHOAI AS SoDienThoai, DIACHI AS DiaChi, CMND, EMAIL
FROM dbo.BenhNhan
WHERE MAYTE = @MaYTe", new { MaYTe = maYTe });

        if (bn == null) return null;

        var bhyt = await _db.OneAsync(@"
SELECT TOP 1 BENHNHAN_BHYT_ID AS BhytId, SOTHE AS SoThe, LOAIBHYT AS LoaiBhyt,
       NGAYHIEULUC AS NgayBatDau, NGAYHETHIEULUC AS NgayKetThuc, TREN5NAM
FROM dbo.BenhNhan_BHYT
WHERE BENHNHAN_ID = @Id
ORDER BY NGAYHIEULUC DESC", new { Id = (int)bn.BenhNhanId });

        return new { benhNhan = bn, bhyt };
    }

    // ── 4. Tạo BN mới (kèm BHYT tùy chọn) ─────────────────────────

    public async Task<dynamic> CreateBenhNhanAsync(BenhNhanCreateReq req, BhytInfo? bhyt, int opId)
    {
        if (string.IsNullOrWhiteSpace(req.HoTen))
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Thiếu họ tên bệnh nhân");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        // 1. Sinh BENHNHAN_ID = MAX+1.
        var newId = await _db.ScalarAsync<int>(
            "SELECT ISNULL(MAX(BENHNHAN_ID), 0) + 1 FROM dbo.BenhNhan WITH (TABLOCKX)");

        // 2. Sinh MAYTE đồng nhất dải mã eHospital (vd 210009xxx): lấy MAX
        //    mã THUẦN SỐ hiện có + 1. TRY_CAST trả NULL cho mã không thuần số
        //    nên tự bỏ qua, MAX chỉ tính trong dải số.
        var lastMa = await _db.ScalarAsync<long?>(@"
SELECT ISNULL(MAX(TRY_CAST(MAYTE AS BIGINT)), 210000000)
FROM dbo.BenhNhan");
        var maYTe = ((lastMa ?? 210000000L) + 1).ToString();

        // 3. Ngày sinh: ưu tiên NgaySinh, fallback NamSinh.
        DateTime? ngaySinh = req.NgaySinh;
        short? namSinh = (short?)req.NamSinh;
        if (ngaySinh.HasValue && !namSinh.HasValue) namSinh = (short)ngaySinh.Value.Year;

        // 4. DIACHITHUONGTRU: ghép theo VỊ TRÍ cố định (tỉnh|xã|địa chỉ|dân tộc|nghề|nhóm máu).
        //    PHẢI giữ chỗ trống bằng chuỗi rỗng (KHÔNG .Where lọc bỏ) — nếu lọc, field
        //    trống bị mất làm các field sau dồn lên, GetBenhNhanDetailAsync parse theo
        //    vị trí sẽ lệch cột (vd nghề nghiệp nhảy vào ô dân tộc). Khớp UpdateBenhNhanAsync.
        var diaChiTT = string.Join("|", new[]
        {
            req.MaTinh, req.MaXa, req.DiaChi, req.MaDanToc, req.MaNgheNghiep, req.NhomMau
        }.Select(s => s ?? string.Empty));
        if (diaChiTT.Replace("|", "").Length == 0) diaChiTT = null!;

        const string sqlInsBn = @"
INSERT INTO dbo.BenhNhan
    (BENHNHAN_ID, MAYTE, TENBENHNHAN, GIOITINH, NGAYSINH, NAMSINH,
     SODIENTHOAI, DIACHI, DIACHITHUONGTRU, CMND, EMAIL,
     ACTIVE, NGAYTAO, NGUOITAO_ID)
VALUES
    (@BenhNhanId, @MaYTe, @HoTen, @GioiTinh, @NgaySinh, @NamSinh,
     @SoDienThoai, @DiaChi, @DiaChiTT, @CMND, @Email,
     '1', SYSDATETIME(), @OpId)";
        await _db.ExecuteAsync(sqlInsBn, new
        {
            BenhNhanId = newId,
            MaYTe = maYTe,
            HoTen = req.HoTen,
            GioiTinh = req.GioiTinh,
            NgaySinh = ngaySinh,
            NamSinh = namSinh,
            SoDienThoai = req.SoDienThoai,
            DiaChi = req.DiaChi,
            DiaChiTT = string.IsNullOrEmpty(diaChiTT) ? null : diaChiTT,
            CMND = req.CCCD,
            Email = req.Email,
            OpId = opId,
        });

        int? bhytId = null;
        if (bhyt != null && !string.IsNullOrWhiteSpace(bhyt.SoBHYT))
        {
            bhytId = await InsertBhytAsync(newId, bhyt);
        }

        scope.Complete();
        return new { benhNhanId = newId, maYTe, bhytId };
    }

    private async Task<int?> InsertBhytAsync(int benhNhanId, BhytInfo bhyt)
    {
        // Idempotent: không insert trùng (BN_ID, SOTHE).
        var existing = await _db.ScalarAsync<int?>(@"
SELECT TOP 1 BENHNHAN_BHYT_ID FROM dbo.BenhNhan_BHYT
WHERE BENHNHAN_ID = @Id AND SOTHE = @So",
            new { Id = benhNhanId, So = bhyt.SoBHYT });
        if (existing.HasValue) return existing.Value;

        int? loaiBhyt = await ResolveLoaiBhytAsync(bhyt.MaQuyenLoi);

        var newId = await _db.ScalarAsync<int>(@"
INSERT INTO dbo.BenhNhan_BHYT
    (BENHNHAN_ID, SOTHE, LOAIBHYT, NGAYHIEULUC, NGAYHETHIEULUC, TAMNGUNG, NGAYTAO)
VALUES
    (@Id, @So, @Loai, @Tu, @Den, '0', SYSDATETIME());
SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new
            {
                Id = benhNhanId,
                So = bhyt.SoBHYT,
                Loai = loaiBhyt,
                Tu = bhyt.NgayBatDau,
                Den = bhyt.NgayKetThuc,
            });
        return newId;
    }

    /// <summary>Map Mã DM_DoiTuong → LOAIBHYT (int) — dùng DoiTuong_Id làm proxy.</summary>
    private async Task<int?> ResolveLoaiBhytAsync(string? maQuyenLoi)
    {
        if (string.IsNullOrWhiteSpace(maQuyenLoi)) return null;
        return await _db.ScalarAsync<int?>(
            "SELECT DoiTuong_Id FROM dbo.DM_DoiTuong WHERE Ma = @Ma",
            new { Ma = maQuyenLoi });
    }

    // ── 5. Tạo TN (auto-tạo BN nếu cần) ───────────────────────────

    public async Task<dynamic> CreateTiepNhanAsync(TiepNhanCreateReq req, int opId)
    {
        if (req.NoiTiepNhanId <= 0)
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Thiếu NoiTiepNhanId");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        int benhNhanId;
        string? maYTe = null;
        int? bhytIdCreated = null;

        if (req.BenhNhanId.HasValue && req.BenhNhanId.Value > 0)
        {
            benhNhanId = req.BenhNhanId.Value;
            maYTe = await _db.ScalarAsync<string>(
                "SELECT MAYTE FROM dbo.BenhNhan WHERE BENHNHAN_ID = @Id",
                new { Id = benhNhanId });

            // CẬP NHẬT hồ sơ BN với thông tin sửa trên form — CHỈ trường CÓ giá trị
            // (NULLIF rỗng → giữ giá trị cũ, KHÔNG ghi đè/xóa trường form chưa load
            // như dân tộc/nghề nghiệp). Theo lựa chọn "cập nhật chỉ trường có nhập".
            if (req.BenhNhan != null)
            {
                await _db.ExecuteAsync(@"
UPDATE dbo.BenhNhan SET
  TENBENHNHAN = COALESCE(NULLIF(LTRIM(RTRIM(@HoTen)), N''), TENBENHNHAN),
  SODIENTHOAI = COALESCE(NULLIF(LTRIM(RTRIM(@Sdt)),   N''), SODIENTHOAI),
  CMND        = COALESCE(NULLIF(LTRIM(RTRIM(@Cccd)),  N''), CMND),
  EMAIL       = COALESCE(NULLIF(LTRIM(RTRIM(@Email)), N''), EMAIL),
  DIACHI      = COALESCE(NULLIF(LTRIM(RTRIM(@DiaChi)),N''), DIACHI)
WHERE BENHNHAN_ID = @Id",
                    new
                    {
                        Id = benhNhanId,
                        HoTen = req.BenhNhan.HoTen,
                        Sdt = req.BenhNhan.SoDienThoai,
                        Cccd = req.BenhNhan.CCCD,
                        Email = req.BenhNhan.Email,
                        DiaChi = req.BenhNhan.DiaChi,
                    });
            }

            if (req.Bhyt != null && !string.IsNullOrWhiteSpace(req.Bhyt.SoBHYT))
                bhytIdCreated = await InsertBhytAsync(benhNhanId, req.Bhyt);
        }
        else
        {
            if (req.BenhNhan == null)
                throw new AppException(ErrorCode.VALIDATION_ERROR,
                    "Cần BenhNhanId hoặc thông tin BenhNhan để tạo mới");
            dynamic created = await CreateBenhNhanAsync(req.BenhNhan, req.Bhyt, opId);
            benhNhanId = created.benhNhanId;
            maYTe = created.maYTe;
            bhytIdCreated = created.bhytId;
        }

        // Sinh SOTIEPNHAN: TN + yyMMdd + 4-digit seq.
        var now = DateTime.Now;
        var sttPrefix = "TN" + now.ToString("yyMMdd");
        var lastSeq = await _db.ScalarAsync<int?>(@"
SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(SOTIEPNHAN, LEN(@Prefix) + 1, 4) AS INT)), 0)
FROM dbo.TiepNhan
WHERE SOTIEPNHAN LIKE @Prefix + '%'", new { Prefix = sttPrefix });
        var soTiepNhan = $"{sttPrefix}{(lastSeq ?? 0) + 1:D4}";
        var soThuTu = $"{(lastSeq ?? 0) + 1:D4}";

        var doiTuongId = string.IsNullOrWhiteSpace(req.DoiTuongId) ? "DV" : req.DoiTuongId;
        int? loaiBhyt = await ResolveLoaiBhytAsync(req.Bhyt?.MaQuyenLoi);

        // TiepNhan.LOAITIEPNHAN_ID, HINHTHUCDENKHAM_ID có thể NULL.
        const string sqlInsTn = @"
INSERT INTO dbo.TiepNhan
    (SOTIEPNHAN, SOTHUTU, BENHNHAN_ID, NOITIEPNHAN_ID,
     NGAYTIEPNHAN, NAMTIEPNHAN, THANGTIEPNHAN, THOIGIANTIEPNHAN,
     DOITUONG_ID, LOAIBHYT, SOBHYT, BHYTTUNGAY, BHYTDENNGAY,
     TRANGTHAI, LYDODENKHAM, LyDoKham, BacSiChiDinh,
     NGAYTAO, NGUOITAO_ID)
VALUES
    (@SoTn, @Stt, @BnId, @NoiTn,
     CAST(@Now AS smalldatetime), @Nam, @Thang, @Now,
     @DtId, @LoaiBhyt, @SoBhyt, @BhytTu, @BhytDen,
     'NEW', @LyDoKham, @LyDoKham, @BsChiDinh,
     SYSDATETIME(), @OpId);
SELECT CAST(SCOPE_IDENTITY() AS INT);";
        var tnId = await _db.ScalarAsync<int>(sqlInsTn, new
        {
            SoTn = soTiepNhan,
            Stt = soThuTu,
            BnId = benhNhanId,
            NoiTn = req.NoiTiepNhanId,
            Now = now,
            Nam = (short)now.Year,
            Thang = (byte)now.Month,
            DtId = doiTuongId,
            LoaiBhyt = loaiBhyt,
            SoBhyt = req.Bhyt?.SoBHYT,
            BhytTu = req.Bhyt?.NgayBatDau,
            BhytDen = req.Bhyt?.NgayKetThuc,
            LyDoKham = req.LyDoKham,
            BsChiDinh = req.BacSiChiDinh,
            OpId = opId,
        });

        // ── Push BN vào hàng đợi Khám bệnh (HangDoi_Id=3, Khu Khám Bệnh) ──
        // BN tiếp nhận xong phải xuất hiện trong queue Khám bệnh để bác sĩ
        // gọi. NoiTiepNhanId = PhongBan_Id của phòng khám đã chọn.
        const int HANGDOI_KHAMBENH = 3;

        // DEDUP: BN đã có lượt KHÁM (HĐ3) hôm nay → KHÔNG tạo số mới, DÙNG LẠI lượt cũ
        // (tránh cùng 1 BN tiếp nhận nhiều lần → nhiều STT 001/002/003 ở hàng đợi Khám).
        var existedRow = await _db.OneAsync(@"
SELECT TOP 1 HangDoiPhongBan_Id, SoThuTuDayDu
FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE BenhNhan_Id = @Bn AND HangDoi_Id = @HangDoiId
  AND NgayThucHien = CONVERT(date, @Now) AND (Huy = 0 OR Huy IS NULL)
ORDER BY HangDoiPhongBan_Id DESC",
            new { Bn = benhNhanId, HangDoiId = HANGDOI_KHAMBENH, Now = now });

        int hdpbId;
        string sttDayDu;
        bool daTiepNhanTruoc = existedRow != null;
        if (daTiepNhanTruoc)
        {
            var ex = (System.Collections.Generic.IDictionary<string, object>)existedRow;
            hdpbId = Convert.ToInt32(ex["HangDoiPhongBan_Id"]);
            sttDayDu = ex["SoThuTuDayDu"]?.ToString() ?? "";
        }
        else
        {
            // ROBUST: MAX theo CẢ STT LẪN SoThuTuDayDu thực tế (số hiển thị) — tránh trùng
            // số khi data seed set SoThuTuDayDu mà STT NULL/lệch (đồng bộ SP_002 ThemBnCheckIn).
            const string sqlMaxStt = @"
SELECT ISNULL(MAX(
    CASE WHEN ISNULL(STT,0) >= ISNULL(TRY_CAST(SoThuTuDayDu AS INT),0)
         THEN ISNULL(STT,0) ELSE ISNULL(TRY_CAST(SoThuTuDayDu AS INT),0) END), 0)
FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId
  AND NgayThucHien = CONVERT(date, @Now) AND (Huy = 0 OR Huy IS NULL)";
            int currentMaxStt = await _db.ScalarAsync<int>(sqlMaxStt, new
            {
                HangDoiId = HANGDOI_KHAMBENH,
                Now = now,
            });
            int sttQueue = currentMaxStt + 1;
            // Format STT khớp SP ThemBnCheckIn: KyTuSTT (DM_HangDoi) + pad 3 số.
            string kyTuStt = await _db.ScalarAsync<string>(
                "SELECT ISNULL(KyTuSTT, N'') FROM dbo.DM_HangDoi WHERE HangDoi_Id = @HD",
                new { HD = HANGDOI_KHAMBENH }) ?? "";
            sttDayDu = kyTuStt + sttQueue.ToString("D3");

            string loaiPhieu = doiTuongId == "DV" ? "NgoaiTru" : "NgoaiTru";
            const string sqlInsQueue = @"
INSERT INTO dbo.HangDoiPhongBan
    (HangDoi_Id, PhongBan_Id, STT, SoThuTuDayDu,
     UuTien, YeuCau, TinhTrang,
     NgayThucHien, NgayGioLaySo,
     BenhNhan_Id, LoaiPhieu, Huy, BoQua, NoiDung, ThoiGian,
     SoLuongChiDinh, ViTriHienTai, TinhTrangHienTai, Khoa)
VALUES
    (@HangDoiId, @PhongBanId, @Stt, @SttDayDu,
     0, 0, 0,
     CONVERT(date, @Now), @Now,
     @BnId, @LoaiPhieu, 0, 0, @NoiDung, @ThoiGian,
     1, N'Khu Khám Bệnh', N'Chờ khám', 0);
SELECT CAST(SCOPE_IDENTITY() AS INT);";
            hdpbId = await _db.ScalarAsync<int>(sqlInsQueue, new
            {
                HangDoiId = HANGDOI_KHAMBENH,
                PhongBanId = req.NoiTiepNhanId,
                Stt = sttQueue,
                SttDayDu = sttDayDu,
                Now = now,
                BnId = benhNhanId,
                LoaiPhieu = loaiPhieu,
                NoiDung = $"Tiếp nhận #{soTiepNhan}",
                ThoiGian = now.Hour <= 11 ? "Sang" : "Chieu",
            });
        }

        scope.Complete();
        return new
        {
            tiepNhanId = tnId,
            soTiepNhan,
            soThuTu,
            benhNhanId,
            maYTe,
            bhytId = bhytIdCreated,
            hangDoiPhongBanId = hdpbId,
            hangDoiSTT = sttDayDu,
            daTiepNhanTruoc,
        };
    }

    // ── 6. Chỉ định CLS (bulk insert DichVuYeuCau) ────────────────

    public async Task<dynamic> ChiDinhClsAsync(ChiDinhClsReq req, int opId)
    {
        if (req.TiepNhanId <= 0)
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Thiếu TiepNhanId");
        if (req.BenhNhanId <= 0)
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Thiếu BenhNhanId");
        if (req.DichVu == null || req.DichVu.Count == 0)
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Chưa chọn dịch vụ");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        // Lấy DOITUONG_ID + NOITIEPNHAN_ID từ TN để fill mặc định.
        var tnInfo = await _db.OneAsync(@"
SELECT DOITUONG_ID, NOITIEPNHAN_ID
FROM dbo.TiepNhan
WHERE TIEPNHAN_ID = @Id", new { Id = req.TiepNhanId });
        if (tnInfo == null)
            throw new AppException(ErrorCode.NOT_FOUND, "Không tìm thấy phiếu tiếp nhận");

        int? doiTuongInt = null;
        if (tnInfo.DOITUONG_ID is string dt && !string.IsNullOrWhiteSpace(dt))
            doiTuongInt = await ResolveLoaiBhytAsync(dt);
        int? noiYeuCauId = tnInfo.NOITIEPNHAN_ID as int?;

        // SOPHIEUYEUCAU dùng chung cho cả batch — định danh đợt chỉ định.
        var now = DateTime.Now;
        var prefix = "P" + now.ToString("yyMMdd");
        var lastSeq = await _db.ScalarAsync<int?>(@"
SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(SOPHIEUYEUCAU, LEN(@Prefix) + 1, 4) AS INT)), 0)
FROM dbo.DichVuYeuCau
WHERE SOPHIEUYEUCAU LIKE @Prefix + '%'", new { Prefix = prefix });
        var soPhieu = $"{prefix}{(lastSeq ?? 0) + 1:D4}";

        // SODICHVUYEUCAU = STT trong phiếu (1, 2, 3…).
        var inserted = new List<int>();
        short sttDv = 1;
        foreach (var item in req.DichVu)
        {
            if (item.DichVuId <= 0) continue;
            var dvId = await _db.ScalarAsync<int>(@"
INSERT INTO dbo.DichVuYeuCau
    (SODICHVUYEUCAU, SOPHIEUYEUCAU, SOTHUTU,
     NGAYYEUCAU, THANGYEUCAU, NAMYEUCAU, NGAYGIOYEUCAU,
     TIEPNHAN_ID, BENHNHAN_ID, DOITUONG_ID, DICHVU_ID, NOIYEUCAU_ID,
     NGUOICHIDINH_ID, TRANGTHAI, HUYYEUCAU, NGAYTAO, NGUOITAO_ID, GHICHU)
VALUES
    (@Stt, @SoPhieu, @SttStr,
     CAST(@Now AS smalldatetime), @Thang, @Nam, @Now,
     @TnId, @BnId, @DtId, @DvId, @NoiYc,
     @OpId, 'NEW', '0', SYSDATETIME(), @OpId, @GhiChu);
SELECT CAST(SCOPE_IDENTITY() AS INT);", new
            {
                Stt = sttDv,
                SoPhieu = soPhieu,
                SttStr = sttDv.ToString("D4"),
                Now = now,
                Thang = (byte)now.Month,
                Nam = (short)now.Year,
                TnId = req.TiepNhanId,
                BnId = req.BenhNhanId,
                DtId = doiTuongInt,
                DvId = item.DichVuId,
                NoiYc = noiYeuCauId,
                OpId = opId,
                GhiChu = item.DonGia.HasValue
                    ? $"SL={item.SoLuong}; Đơn giá={item.DonGia.Value:0.##}"
                    : (item.SoLuong > 1 ? $"SL={item.SoLuong}" : null),
            });
            inserted.Add(dvId);
            sttDv++;
        }

        scope.Complete();
        return new { soPhieuYeuCau = soPhieu, dvYeuCauIds = inserted, count = inserted.Count };
    }

    // ── Pha 6: Quản lý bệnh nhân ──────────────────────────────────

    /// <summary>List BN paged với filter — gộp BHYT mới nhất.</summary>
    public async Task<PagedResult<BenhNhanListItem>> ListBenhNhanAsync(
        string? q, int? doiTuongId, int? gioiTinh, int page, int pageSize)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 20;

        var kw = (q ?? "").Trim();
        var hasKw = kw.Length > 0;
        var like = $"%{kw}%";

        // Filter chung: chỉ BN ACTIVE='1' (soft-delete dùng ACTIVE='0').
        const string whereBase = @"
WHERE bn.ACTIVE = '1'
  AND (@HasKw = 0 OR bn.TENBENHNHAN LIKE @Like OR bn.MAYTE LIKE @Like
       OR bn.SODIENTHOAI LIKE @Like OR bn.CMND LIKE @Like)
  AND (@GioiTinh IS NULL OR bn.GIOITINH = @GioiTinh)
  AND (@DoiTuongId IS NULL OR bhyt.LOAIBHYT = @DoiTuongId)";

        // BHYT mới nhất qua subquery: OUTER APPLY TOP 1.
        const string fromBlock = @"
FROM dbo.BenhNhan bn
OUTER APPLY (
    SELECT TOP 1 b.BENHNHAN_BHYT_ID, b.SOTHE, b.LOAIBHYT, b.NGAYHIEULUC, b.NGAYHETHIEULUC
    FROM dbo.BenhNhan_BHYT b
    WHERE b.BENHNHAN_ID = bn.BENHNHAN_ID
      AND (b.TAMNGUNG IS NULL OR b.TAMNGUNG <> '1')
    ORDER BY b.NGAYHIEULUC DESC, b.BENHNHAN_BHYT_ID DESC
) bhyt
LEFT JOIN dbo.DM_DoiTuong dt ON dt.DoiTuong_Id = bhyt.LOAIBHYT";

        var paramObj = new
        {
            HasKw = hasKw ? 1 : 0,
            Like = like,
            GioiTinh = gioiTinh,
            DoiTuongId = doiTuongId,
            Offset = (page - 1) * pageSize,
            PageSize = pageSize,
        };

        // 1. Đếm tổng.
        var total = await _db.ScalarAsync<int>(
            $"SELECT COUNT(*) {fromBlock} {whereBase}", paramObj);

        // 2. Lấy data trang.
        var sql = $@"
SELECT bn.BENHNHAN_ID AS BenhNhanId, bn.MAYTE AS MaYTe, bn.TENBENHNHAN AS TenBenhNhan,
       bn.GIOITINH AS GioiTinh,
       CASE bn.GIOITINH WHEN 1 THEN N'Nam' WHEN 2 THEN N'Nữ' WHEN 3 THEN N'Khác' ELSE N'' END AS GioiTinhText,
       bn.NGAYSINH AS NgaySinh, bn.NAMSINH AS NamSinh,
       bn.SODIENTHOAI AS SoDienThoai, bn.CMND, bn.DIACHI AS DiaChi,
       bn.DIACHITHUONGTRU AS DiaChiThuongTru, bn.EMAIL AS Email, bn.NGAYTAO AS NgayTao,
       bhyt.BENHNHAN_BHYT_ID AS BhytId, bhyt.SOTHE AS SoBHYT,
       bhyt.LOAIBHYT AS LoaiBhyt, dt.Ma AS MaDoiTuong, dt.TenDoiTuong AS TenDoiTuong,
       bhyt.NGAYHIEULUC AS BhytTuNgay, bhyt.NGAYHETHIEULUC AS BhytDenNgay
{fromBlock}
{whereBase}
ORDER BY bn.NGAYTAO DESC, bn.BENHNHAN_ID DESC
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = await _db.ListAsync<BenhNhanListItem>(sql, paramObj);

        return new PagedResult<BenhNhanListItem>
        {
            Items = items,
            Total = total,
            Page = page,
            PageSize = pageSize,
        };
    }

    /// <summary>Chi tiết BN — parse DIACHITHUONGTRU thành các trường con.</summary>
    public async Task<BenhNhanDetail?> GetBenhNhanDetailAsync(int benhNhanId)
    {
        const string sql = @"
SELECT bn.BENHNHAN_ID AS BenhNhanId, bn.MAYTE AS MaYTe, bn.TENBENHNHAN AS TenBenhNhan,
       bn.GIOITINH AS GioiTinh,
       CASE bn.GIOITINH WHEN 1 THEN N'Nam' WHEN 2 THEN N'Nữ' WHEN 3 THEN N'Khác' ELSE N'' END AS GioiTinhText,
       bn.NGAYSINH AS NgaySinh, bn.NAMSINH AS NamSinh,
       bn.SODIENTHOAI AS SoDienThoai, bn.CMND, bn.DIACHI AS DiaChi,
       bn.DIACHITHUONGTRU AS DiaChiThuongTru, bn.EMAIL AS Email, bn.NGAYTAO AS NgayTao,
       bhyt.BENHNHAN_BHYT_ID AS BhytId, bhyt.SOTHE AS SoBHYT,
       bhyt.LOAIBHYT AS LoaiBhyt, dt.Ma AS MaDoiTuong, dt.TenDoiTuong AS TenDoiTuong,
       dt.TYLE_BHYT AS TyLeBhyt,
       bhyt.NGAYHIEULUC AS BhytTuNgay, bhyt.NGAYHETHIEULUC AS BhytDenNgay
FROM dbo.BenhNhan bn
OUTER APPLY (
    SELECT TOP 1 b.BENHNHAN_BHYT_ID, b.SOTHE, b.LOAIBHYT, b.NGAYHIEULUC, b.NGAYHETHIEULUC
    FROM dbo.BenhNhan_BHYT b
    WHERE b.BENHNHAN_ID = bn.BENHNHAN_ID
      AND (b.TAMNGUNG IS NULL OR b.TAMNGUNG <> '1')
    ORDER BY b.NGAYHIEULUC DESC, b.BENHNHAN_BHYT_ID DESC
) bhyt
LEFT JOIN dbo.DM_DoiTuong dt ON dt.DoiTuong_Id = bhyt.LOAIBHYT
WHERE bn.BENHNHAN_ID = @Id";

        var detail = await _db.OneAsync<BenhNhanDetail>(sql, new { Id = benhNhanId });
        if (detail == null) return null;

        // Parse DIACHITHUONGTRU = "MaTinh|MaXa|DiaChi|MaDanToc|MaNgheNghiep|NhomMau".
        // Chỉ parse khi field có '|' (do CreateBenhNhanAsync sinh ra). Data clone từ HIS
        // cũ thường là địa chỉ raw không có '|' → fallback vào DiaChi.
        if (!string.IsNullOrWhiteSpace(detail.DiaChiThuongTru))
        {
            if (detail.DiaChiThuongTru.Contains('|'))
            {
                var parts = detail.DiaChiThuongTru.Split('|');
                string Get(int i) => i < parts.Length ? parts[i] : string.Empty;
                detail.MaTinh = string.IsNullOrWhiteSpace(Get(0)) ? null : Get(0);
                detail.MaXa = string.IsNullOrWhiteSpace(Get(1)) ? null : Get(1);
                if (string.IsNullOrWhiteSpace(detail.DiaChi))
                    detail.DiaChi = string.IsNullOrWhiteSpace(Get(2)) ? null : Get(2);
                detail.MaDanToc = string.IsNullOrWhiteSpace(Get(3)) ? null : Get(3);
                detail.MaNgheNghiep = string.IsNullOrWhiteSpace(Get(4)) ? null : Get(4);
                detail.NhomMau = string.IsNullOrWhiteSpace(Get(5)) ? null : Get(5);
            }
            else if (string.IsNullOrWhiteSpace(detail.DiaChi))
            {
                // Legacy raw address → đẩy vào DiaChi cho user thấy.
                detail.DiaChi = detail.DiaChiThuongTru;
            }
        }

        return detail;
    }

    /// <summary>Lịch sử tiếp nhận của BN — sort theo ngày giảm dần.</summary>
    public Task<IEnumerable<TiepNhanHistoryItem>> ListTiepNhanByBenhNhanAsync(int benhNhanId)
        => _db.ListAsync<TiepNhanHistoryItem>(@"
SELECT tn.TIEPNHAN_ID AS TiepNhanId,
       tn.SOTIEPNHAN AS SoTiepNhan,
       tn.NGAYTIEPNHAN AS NgayTiepNhan,
       tn.DOITUONG_ID AS DoiTuongId,
       dt.TenDoiTuong AS TenDoiTuong,
       tn.NOITIEPNHAN_ID AS NoiTiepNhanId,
       pb.TenPhongBan AS TenPhongBan,
       tn.LyDoKham AS LyDoKham,
       tn.BacSiChiDinh AS BacSiChiDinh,
       tn.TRANGTHAI AS TrangThai
FROM dbo.TiepNhan tn
LEFT JOIN dbo.DM_DoiTuong dt ON dt.Ma = tn.DOITUONG_ID
LEFT JOIN dbo.DM_PhongBan pb ON pb.PhongBan_Id = tn.NOITIEPNHAN_ID
WHERE tn.BENHNHAN_ID = @Id
ORDER BY tn.NGAYTIEPNHAN DESC, tn.TIEPNHAN_ID DESC",
            new { Id = benhNhanId });

    /// <summary>Update info BN + BHYT (atomic). Idempotent.</summary>
    public async Task<bool> UpdateBenhNhanAsync(int benhNhanId, BenhNhanUpdateReq req, int opId)
    {
        if (req.BenhNhan == null)
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Thiếu thông tin bệnh nhân");
        if (string.IsNullOrWhiteSpace(req.BenhNhan.HoTen))
            throw new AppException(ErrorCode.VALIDATION_ERROR, "Thiếu họ tên bệnh nhân");

        // Verify BN tồn tại + chưa bị soft-delete.
        var exists = await _db.ScalarAsync<int?>(
            "SELECT BENHNHAN_ID FROM dbo.BenhNhan WHERE BENHNHAN_ID = @Id AND ACTIVE = '1'",
            new { Id = benhNhanId });
        if (!exists.HasValue)
            throw new AppException(ErrorCode.NOT_FOUND, "Không tìm thấy bệnh nhân");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        var bn = req.BenhNhan;
        DateTime? ngaySinh = bn.NgaySinh;
        short? namSinh = (short?)bn.NamSinh;
        if (ngaySinh.HasValue && !namSinh.HasValue) namSinh = (short)ngaySinh.Value.Year;

        // Ghép DIACHITHUONGTRU theo cùng format CreateBenhNhanAsync dùng.
        var diaChiTT = string.Join("|", new[]
        {
            bn.MaTinh, bn.MaXa, bn.DiaChi, bn.MaDanToc, bn.MaNgheNghiep, bn.NhomMau
        }.Select(s => s ?? string.Empty));
        // Nếu tất cả empty thì set null thay vì 5 dấu '|'.
        if (diaChiTT.Replace("|", "").Length == 0) diaChiTT = null!;

        const string sqlUpdBn = @"
UPDATE dbo.BenhNhan
SET TENBENHNHAN     = @HoTen,
    GIOITINH        = @GioiTinh,
    NGAYSINH        = @NgaySinh,
    NAMSINH         = @NamSinh,
    SODIENTHOAI     = @SoDienThoai,
    DIACHI          = @DiaChi,
    DIACHITHUONGTRU = @DiaChiTT,
    CMND            = @CMND,
    EMAIL           = @Email,
    NGAYCAPNHAT     = SYSDATETIME(),
    NGUOICAPNHAT_ID = @OpId
WHERE BENHNHAN_ID = @Id";
        await _db.ExecuteAsync(sqlUpdBn, new
        {
            Id = benhNhanId,
            HoTen = bn.HoTen,
            GioiTinh = bn.GioiTinh,
            NgaySinh = ngaySinh,
            NamSinh = namSinh,
            SoDienThoai = bn.SoDienThoai,
            DiaChi = bn.DiaChi,
            DiaChiTT = diaChiTT,
            CMND = bn.CCCD,
            Email = bn.Email,
            OpId = opId,
        });

        // Xử lý BHYT (nếu có).
        if (req.Bhyt != null && !string.IsNullOrWhiteSpace(req.Bhyt.SoBHYT))
        {
            int? loaiBhyt = await ResolveLoaiBhytAsync(req.Bhyt.MaQuyenLoi);

            // Lấy BHYT đang active mới nhất.
            var latestBhytId = await _db.ScalarAsync<int?>(@"
SELECT TOP 1 BENHNHAN_BHYT_ID FROM dbo.BenhNhan_BHYT
WHERE BENHNHAN_ID = @Id AND (TAMNGUNG IS NULL OR TAMNGUNG <> '1')
ORDER BY NGAYHIEULUC DESC, BENHNHAN_BHYT_ID DESC", new { Id = benhNhanId });

            if (latestBhytId.HasValue)
            {
                // Update bản BHYT mới nhất.
                await _db.ExecuteAsync(@"
UPDATE dbo.BenhNhan_BHYT
SET SOTHE          = @So,
    LOAIBHYT       = @Loai,
    NGAYHIEULUC    = @Tu,
    NGAYHETHIEULUC = @Den,
    NGAYCAPNHAT    = SYSDATETIME()
WHERE BENHNHAN_BHYT_ID = @BhytId",
                    new
                    {
                        BhytId = latestBhytId.Value,
                        So = req.Bhyt.SoBHYT,
                        Loai = loaiBhyt,
                        Tu = req.Bhyt.NgayBatDau,
                        Den = req.Bhyt.NgayKetThuc,
                    });
            }
            else
            {
                // Insert mới.
                await InsertBhytAsync(benhNhanId, req.Bhyt);
            }
        }

        scope.Complete();
        return true;
    }

    /// <summary>Soft delete: ACTIVE = '0'. Idempotent (gọi nhiều lần không error).</summary>
    public async Task<bool> SoftDeleteBenhNhanAsync(int benhNhanId, int opId)
    {
        var rows = await _db.ExecuteAsync(@"
UPDATE dbo.BenhNhan
SET ACTIVE          = '0',
    NGAYCAPNHAT     = SYSDATETIME(),
    NGUOICAPNHAT_ID = @OpId
WHERE BENHNHAN_ID = @Id AND ACTIVE = '1'",
            new { Id = benhNhanId, OpId = opId });

        // Idempotent: rows=0 nếu BN không tồn tại hoặc đã soft-delete trước → vẫn return true.
        // Chỉ throw nếu BN không tồn tại CỦA HẾT (không phân biệt deleted).
        var stillExists = await _db.ScalarAsync<int?>(
            "SELECT BENHNHAN_ID FROM dbo.BenhNhan WHERE BENHNHAN_ID = @Id",
            new { Id = benhNhanId });
        if (!stillExists.HasValue)
            throw new AppException(ErrorCode.NOT_FOUND, "Không tìm thấy bệnh nhân");

        return rows >= 0;
    }

    // ── 7. List DV đã chỉ định cho 1 TN ───────────────────────────

    public Task<IEnumerable<dynamic>> ListDichVuYeuCauByTiepNhanAsync(int tiepNhanId)
        => _db.ListAsync(@"
SELECT dv.DVYEUCAU_ID AS DvYeuCauId,
       dv.SOPHIEUYEUCAU AS SoPhieuYeuCau,
       dv.SODICHVUYEUCAU AS SoDichVuYeuCau,
       dv.NGAYGIOYEUCAU AS NgayGioYeuCau,
       dv.DICHVU_ID AS DichVuId,
       dm.MADICHVU AS MaDichVu,
       dm.TENDICHVU AS TenDichVu,
       dm.DONVITINH AS DonViTinh,
       dv.TRANGTHAI AS TrangThai,
       dv.GHICHU AS GhiChu
FROM dbo.DichVuYeuCau dv
LEFT JOIN dbo.DM_DichVu dm ON dm.DICHVU_ID = dv.DICHVU_ID
WHERE dv.TIEPNHAN_ID = @Id AND (dv.HUYYEUCAU IS NULL OR dv.HUYYEUCAU <> '1')
ORDER BY dv.DVYEUCAU_ID", new { Id = tiepNhanId });
}
