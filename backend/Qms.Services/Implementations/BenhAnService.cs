using System.Transactions;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;

namespace Qms.Services.Implementations;

public class BenhAnService : IBenhAnService
{
    private readonly IDatabaseHelper _db;
    public BenhAnService(IDatabaseHelper db) => _db = db;

    public async Task<BenhAnCreateResult> CreateBenhAnAsync(BenhAnCreateReq req, int userId, string? userName)
    {
        if (req.BenhNhan_Id <= 0 || req.TiepNhan_Id <= 0)
            throw new ArgumentException("Thiếu BenhNhan_Id hoặc TiepNhan_Id");
        if (string.IsNullOrWhiteSpace(req.ChanDoan))
            throw new ArgumentException("Chẩn đoán không được trống");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        var now = DateTime.Now;
        var phieus = new List<PhieuChiDinhInfo>();  // phiếu CLS/CDHA để FE in

        // ── 1. UPSERT KB_BenhAn (1 bệnh án / 1 lượt khám) ──────────
        // Tìm bệnh án đã có cho lượt khám này (HangDoiPhongBan_Id). Đã có →
        // UPDATE (BN quay lại sau CLS, bác sĩ bổ sung chẩn đoán/đơn). Chưa →
        // INSERT mới. Nhờ vậy submit lần 2 KHÔNG tạo bệnh án trùng.
        int existingId = 0;
        if (req.HangDoiPhongBan_Id > 0)
        {
            existingId = await _db.ScalarAsync<int?>(
                @"SELECT TOP 1 BenhAn_Id FROM dbo.KB_BenhAn
                  WHERE HangDoiPhongBan_Id = @Hdpb ORDER BY BenhAn_Id DESC",
                new { Hdpb = req.HangDoiPhongBan_Id }) ?? 0;
        }

        var baParams = new
        {
            TiepNhanId = req.TiepNhan_Id,
            BenhNhanId = req.BenhNhan_Id,
            HdpbId = req.HangDoiPhongBan_Id <= 0 ? (int?)null : req.HangDoiPhongBan_Id,
            UserId = userId,
            UserName = userName ?? "",
            Now = now,
            LyDo = req.LyDoKham,
            TrChung = req.TrieuChung,
            ChanDoan = req.ChanDoan,
            ICD = req.ChanDoanICD,
            HuongDt = req.HuongDieuTri,
            GhiChu = req.GhiChu,
            Id = existingId,
        };

        int benhAnId;
        if (existingId > 0)
        {
            await _db.ExecuteAsync(@"
UPDATE dbo.KB_BenhAn
SET LyDoKham = @LyDo, TrieuChung = @TrChung, ChanDoan = @ChanDoan,
    ChanDoanICD = @ICD, HuongDieuTri = @HuongDt, GhiChu = @GhiChu,
    TenBacSi = @UserName, NgayKham = @Now
WHERE BenhAn_Id = @Id;", baParams);
            benhAnId = existingId;
        }
        else
        {
            benhAnId = await _db.ScalarAsync<int>(@"
INSERT INTO dbo.KB_BenhAn
    (TiepNhan_Id, BenhNhan_Id, HangDoiPhongBan_Id, BacSi_Id, TenBacSi,
     NgayKham, LyDoKham, TrieuChung, ChanDoan, ChanDoanICD,
     HuongDieuTri, GhiChu, NgayTao, NguoiTao_Id)
VALUES
    (@TiepNhanId, @BenhNhanId, @HdpbId, @UserId, @UserName,
     @Now, @LyDo, @TrChung, @ChanDoan, @ICD,
     @HuongDt, @GhiChu, @Now, @UserId);
SELECT CAST(SCOPE_IDENTITY() AS INT);", baParams);
        }

        // ── 2. Chỉ định CLS → INSERT dbo.DichVuYeuCau + push HangDoiPhongBan
        if (req.ChiDinhCLS?.Count > 0)
        {
            foreach (var cd in req.ChiDinhCLS)
            {
                if (cd.DichVu_Id <= 0) continue;

                // Dedup: BN đã được chỉ định DV này hôm nay (chưa hủy) → bỏ
                // qua, không tạo phiếu trùng (chống submit 2 lần / double-click).
                int daCo = await _db.ScalarAsync<int>(
                    @"SELECT COUNT(*) FROM dbo.DichVuYeuCau
                      WHERE BENHNHAN_ID = @Bn AND DICHVU_ID = @Dv
                        AND CONVERT(date, NGAYYEUCAU) = CONVERT(date, @Now) AND HUYYEUCAU = 0",
                    new { Bn = req.BenhNhan_Id, Dv = cd.DichVu_Id, Now = now });
                if (daCo > 0) continue;

                // 2a. Lấy info DV (tên, nhóm) để tính HangDoi target
                var dvRow = await _db.OneAsync(
                    @"SELECT TENDICHVU, NHOMDICHVU_ID, LoaiDV, DonGia
                       FROM dbo.DM_DichVu WHERE DICHVU_ID = @Id",
                    new { Id = cd.DichVu_Id });
                if (dvRow == null) continue;
                var dvDict = (IDictionary<string, object>)dvRow;
                string tenDv = dvDict["TENDICHVU"]?.ToString() ?? "";
                int nhomId = Convert.ToInt32(dvDict["NHOMDICHVU_ID"] ?? 0);

                // 2b. Sinh SoPhieuYeuCau từ MAX hiện có
                var prefix = (now.Year % 100).ToString("D2") + ".5.";
                int nextSeq = await _db.ScalarAsync<int?>(
                    @"SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(SOPHIEUYEUCAU, LEN(@Prefix)+1, 6) AS int)),0) + 1
                      FROM dbo.DichVuYeuCau WHERE SOPHIEUYEUCAU LIKE @Prefix + '%'",
                    new { Prefix = prefix }) ?? 1;
                string soPhieu = prefix + nextSeq.ToString("D6");

                // 2c. INSERT DichVuYeuCau
                const string sqlInsYc = @"
INSERT INTO dbo.DichVuYeuCau
    (TIEPNHAN_ID, SODICHVUYEUCAU, SOPHIEUYEUCAU,
     BENHNHAN_ID, DOITUONG_ID, DICHVU_ID,
     NGUOICHIDINH_ID, BACSICHIDINH_ID,
     GIOYEUCAU, NGAYYEUCAU, THANGYEUCAU, NAMYEUCAU, NGAYGIOYEUCAU,
     NOIYEUCAU_ID, NOITHUCHIEN_ID, TRANGTHAI, KHOADULIEU,
     BENHVIEN_ID, NGAYTAO, NGUOITAO_ID, HUYYEUCAU, THUTIENSAU, NOIDUNGCHITIET)
VALUES
    (@TiepNhanId, @SoLuong, @SoPhieu,
     @BenhNhanId, 1, @DichVuId,
     @UserId, @UserId,
     @Hour, @Today, @Month, @Year, @Now,
     8, @NoiThucHien, N'CHUAKETQUA', 0,
     '48017', @Now, @UserId, 0, 0, @TenDv);
SELECT CAST(SCOPE_IDENTITY() AS INT);";
                // PhongBan đích theo nhóm DV
                int noiThucHien = MapNhomToPhongBan(nhomId, tenDv);
                int dvYeuCauId = await _db.ScalarAsync<int>(sqlInsYc, new
                {
                    TiepNhanId = req.TiepNhan_Id,
                    SoLuong = cd.SoLuong,
                    SoPhieu = soPhieu,
                    BenhNhanId = req.BenhNhan_Id,
                    DichVuId = cd.DichVu_Id,
                    UserId = userId,
                    Hour = now.Hour,
                    Today = now.Date,
                    Month = (byte)now.Month,
                    Year = (short)now.Year,
                    Now = now,
                    NoiThucHien = noiThucHien,
                    TenDv = tenDv,
                });

                // 2d. SCAN-ON-ARRIVAL: KHÔNG auto-push vào hàng đợi nữa.
                // Chỉ thu thập thông tin phiếu để FE in (kèm barcode/QR).
                // BN cầm phiếu tới phòng → KTV quét số phiếu (trang Nhận bệnh
                // → /cls/check-barcode → /cls/insert = ThemBnCheckIn) thì mới
                // vào hàng đợi phòng đó. Nhờ vậy BN luôn chỉ ở 1 hàng đợi, hết
                // cảnh 1 BN nằm trong nhiều hàng đợi cùng lúc.
                int hangDoiTarget = MapNhomToHangDoi(nhomId, tenDv);
                string? tenPhong = await _db.ScalarAsync<string>(
                    "SELECT TenPhongBan FROM dbo.DM_PhongBan WHERE PhongBan_Id = @Id",
                    new { Id = noiThucHien });
                phieus.Add(new PhieuChiDinhInfo
                {
                    SoPhieu = soPhieu,
                    TenDichVu = tenDv,
                    HangDoi_Id = hangDoiTarget,
                    PhongBan_Id = noiThucHien,
                    TenPhongBan = tenPhong,
                });
            }
        }

        // ── 3. Đơn thuốc → thay đơn cũ rồi INSERT lại ─────────────
        if (req.DonThuoc?.Count > 0)
        {
            // Re-submit: xóa đơn cũ của bệnh án này (nếu có) → tạo lại theo
            // danh sách mới nhất (đơn non-empty = nguồn sự thật). donThuoc rỗng
            // thì giữ nguyên đơn cũ (nhánh này không chạy).
            await _db.ExecuteAsync(@"
DELETE ct FROM dbo.KB_DonThuoc_ChiTiet ct
  INNER JOIN dbo.KB_DonThuoc d ON ct.DonThuoc_Id = d.DonThuoc_Id
  WHERE d.BenhAn_Id = @BaId;
DELETE FROM dbo.KB_DonThuoc WHERE BenhAn_Id = @BaId;",
                new { BaId = benhAnId });

            const string sqlInsDt = @"
INSERT INTO dbo.KB_DonThuoc
    (BenhAn_Id, TiepNhan_Id, BenhNhan_Id, BacSi_Id, TenBacSi,
     NgayKe, TrangThai, TongTien)
VALUES
    (@BaId, @TiepNhanId, @BenhNhanId, @UserId, @UserName,
     @Now, N'ChoPhat', 0);
SELECT CAST(SCOPE_IDENTITY() AS INT);";
            int donThuocId = await _db.ScalarAsync<int>(sqlInsDt, new
            {
                BaId = benhAnId,
                TiepNhanId = req.TiepNhan_Id,
                BenhNhanId = req.BenhNhan_Id,
                UserId = userId,
                UserName = userName ?? "",
                Now = now,
            });

            decimal tongTien = 0;
            foreach (var t in req.DonThuoc)
            {
                var dv = await _db.OneAsync(
                    "SELECT TENDICHVU, DonGia, DonViTinh FROM dbo.DM_DichVu WHERE DICHVU_ID = @Id",
                    new { Id = t.DichVu_Id });
                decimal dg = 0; string ten = t.TenThuoc; string? donVi = t.DonViTinh;
                if (dv != null)
                {
                    var d = (IDictionary<string, object>)dv;
                    dg = Convert.ToDecimal(d["DonGia"] ?? 0);
                    if (string.IsNullOrEmpty(ten)) ten = d["TENDICHVU"]?.ToString() ?? "";
                    if (string.IsNullOrEmpty(donVi)) donVi = d["DonViTinh"]?.ToString();
                }
                decimal thanhTien = dg * t.SoLuong;
                tongTien += thanhTien;

                await _db.ExecuteAsync(@"
INSERT INTO dbo.KB_DonThuoc_ChiTiet
    (DonThuoc_Id, DichVu_Id, TenThuoc, SoLuong, DonViTinh, LieuDung, DonGia, ThanhTien)
VALUES
    (@DtId, @DvId, @Ten, @SL, @DV, @Lieu, @Gia, @TT);",
                    new
                    {
                        DtId = donThuocId,
                        DvId = t.DichVu_Id,
                        Ten = ten,
                        SL = t.SoLuong,
                        DV = donVi,
                        Lieu = t.LieuDung,
                        Gia = dg,
                        TT = thanhTien,
                    });
            }

            // Update tổng tiền đơn thuốc
            await _db.ExecuteAsync(
                "UPDATE dbo.KB_DonThuoc SET TongTien = @T WHERE DonThuoc_Id = @Id",
                new { T = tongTien, Id = donThuocId });

            // MÔ HÌNH MỚI (doctor-transfer): KHÔNG auto-push Nhà thuốc.
            // Bác sĩ chủ động "Chuyển tiếp" khi BN khám xong.
        }

        // ── 3b/4. MÔ HÌNH DOCTOR-TRANSFER ─────────────────────────
        // KHÔNG auto-đẩy Viện phí/Nhà thuốc, KHÔNG auto-hoàn-tất lượt khám.
        // Lý do: BN có chỉ định CLS sẽ đi làm CLS rồi QUAY LẠI để bác sĩ kết
        // luận. Bác sĩ chủ động bấm "Chuyển tiếp" (chuyen-sang-vp/nt) hoặc
        // "Hoàn tất" khi BN thật sự xong → lúc đó lượt khám mới hoàn tất +
        // BN mới vào hàng đợi viện phí/nhà thuốc (đúng lúc BN có mặt). Nhờ
        // vậy BN không bị gọi ở viện phí khi còn đang làm CLS.
        // (req.ThuTienSau giữ trong DTO nhưng không dùng ở bước này nữa.)

        scope.Complete();
        return new BenhAnCreateResult { BenhAn_Id = benhAnId, Phieus = phieus };
    }

    public async Task<BenhAnDetailDto?> GetBenhAnDetailAsync(int benhAnId)
    {
        var ba = await _db.OneAsync(@"
SELECT
    ba.BenhAn_Id, ba.TiepNhan_Id, ba.BenhNhan_Id,
    ba.NgayKham, ba.TenBacSi,
    ba.LyDoKham, ba.TrieuChung, ba.ChanDoan, ba.ChanDoanICD,
    ba.HuongDieuTri, ba.GhiChu,
    bn.TENBENHNHAN AS TenBenhNhan, bn.NAMSINH AS NamSinh
FROM dbo.KB_BenhAn ba WITH (NOLOCK)
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK) ON ba.BenhNhan_Id = bn.BENHNHAN_ID
WHERE ba.BenhAn_Id = @Id;", new { Id = benhAnId });
        if (ba == null) return null;
        var dict = (IDictionary<string, object>)ba;

        var dto = new BenhAnDetailDto
        {
            BenhAn_Id = Convert.ToInt32(dict["BenhAn_Id"]),
            TiepNhan_Id = Convert.ToInt32(dict["TiepNhan_Id"]),
            BenhNhan_Id = Convert.ToInt32(dict["BenhNhan_Id"]),
            TenBenhNhan = dict["TenBenhNhan"]?.ToString(),
            NamSinh = dict["NamSinh"] == null ? null : Convert.ToInt32(dict["NamSinh"]),
            NgayKham = Convert.ToDateTime(dict["NgayKham"]),
            TenBacSi = dict["TenBacSi"]?.ToString(),
            LyDoKham = dict["LyDoKham"]?.ToString(),
            TrieuChung = dict["TrieuChung"]?.ToString(),
            ChanDoan = dict["ChanDoan"]?.ToString(),
            ChanDoanICD = dict["ChanDoanICD"]?.ToString(),
            HuongDieuTri = dict["HuongDieuTri"]?.ToString(),
            GhiChu = dict["GhiChu"]?.ToString(),
        };

        // Chỉ định CLS từ DichVuYeuCau (cùng TiepNhan, NgayYeuCau = NgayKham)
        var cls = await _db.ListAsync(@"
SELECT yc.DVYEUCAU_ID, yc.DICHVU_ID, yc.SOPHIEUYEUCAU,
       dv.TENDICHVU, dv.DonGia, dv.LoaiDV, yc.TRANGTHAI,
       kq.KetQua_Id, kq.KetLuan
FROM dbo.DichVuYeuCau yc WITH (NOLOCK)
LEFT JOIN dbo.DM_DichVu dv WITH (NOLOCK) ON yc.DICHVU_ID = dv.DICHVU_ID
LEFT JOIN dbo.KB_KetQuaCLS kq WITH (NOLOCK) ON yc.DVYEUCAU_ID = kq.DVYEUCAU_ID
WHERE yc.TIEPNHAN_ID = @T AND yc.BENHNHAN_ID = @B AND yc.HUYYEUCAU = 0
  AND ISNULL(dv.LoaiDV, N'') <> N'KhamBenh'  -- loại phí khám (tính ở Viện phí); CLS chỉ ghi chỉ định
ORDER BY yc.DVYEUCAU_ID;",
            new { T = dto.TiepNhan_Id, B = dto.BenhNhan_Id });
        dto.ChiDinhCLS = cls.ToList();

        // Thuốc theo BenhAn_Id
        var thuoc = await _db.ListAsync(@"
SELECT dt.DonThuoc_Id, dt.TrangThai, dt.NgayKe, dt.TongTien,
       ct.ChiTiet_Id, ct.DichVu_Id, ct.TenThuoc, ct.SoLuong, ct.DonViTinh,
       ct.LieuDung, ct.DonGia, ct.ThanhTien
FROM dbo.KB_DonThuoc dt WITH (NOLOCK)
JOIN dbo.KB_DonThuoc_ChiTiet ct WITH (NOLOCK) ON dt.DonThuoc_Id = ct.DonThuoc_Id
WHERE dt.BenhAn_Id = @Id
ORDER BY ct.ChiTiet_Id;",
            new { Id = benhAnId });
        dto.Thuoc = thuoc.ToList();

        return dto;
    }

    /// <summary>Bệnh án (đầy đủ chẩn đoán + CLS + thuốc) của 1 LƯỢT KHÁM theo
    /// HangDoiPhongBan_Id — để màn Khám load lại form khi BN đã có bệnh án (sửa,
    /// không mất record cũ). Trả null nếu lượt khám chưa có bệnh án.</summary>
    public async Task<BenhAnDetailDto?> GetBenhAnByHangDoiPhongBanAsync(int hangDoiPhongBanId)
    {
        if (hangDoiPhongBanId <= 0) return null;
        var id = await _db.ScalarAsync<int?>(
            @"SELECT TOP 1 BenhAn_Id FROM dbo.KB_BenhAn WITH (NOLOCK)
              WHERE HangDoiPhongBan_Id = @Id ORDER BY BenhAn_Id DESC",
            new { Id = hangDoiPhongBanId });
        if (!id.HasValue) return null;
        return await GetBenhAnDetailAsync(id.Value);
    }

    public Task<IEnumerable<dynamic>> GetLichSuByBenhNhanAsync(int benhNhanId, int top = 20)
        => _db.ListAsync(@"
SELECT TOP (" + top + @") ba.BenhAn_Id, ba.NgayKham, ba.TenBacSi,
       ba.LyDoKham, ba.ChanDoan, ba.HuongDieuTri
FROM dbo.KB_BenhAn ba WITH (NOLOCK)
WHERE ba.BenhNhan_Id = @Id
ORDER BY ba.NgayKham DESC;", new { Id = benhNhanId });

    public Task<dynamic?> GetTiepNhanLyDoAsync(int tiepNhanId)
        => _db.OneAsync(@"
SELECT TOP 1
    LyDoKham     = ISNULL(NULLIF(LTRIM(RTRIM(tn.LyDoKham)), N''), tn.LYDODENKHAM),
    BacSiChiDinh = tn.BacSiChiDinh
FROM dbo.TiepNhan tn
WHERE tn.TIEPNHAN_ID = @Id;", new { Id = tiepNhanId });

    /// <summary>
    /// Danh sách bệnh án đã khám — lọc theo khoảng ngày + phòng + từ khóa
    /// (tên/mã y tế). Dùng cho trang "Lịch sử khám bệnh" duyệt theo ngày.
    /// phongBanId = 0 → tất cả phòng. keyword rỗng → không lọc.
    /// </summary>
    public Task<IEnumerable<dynamic>> GetDanhSachBenhAnAsync(
        DateTime tuNgay, DateTime denNgay, int phongBanId, string keyword)
        => _db.ListAsync(@"
SELECT
    ba.BenhAn_Id,
    ba.NgayKham,
    MaYTe       = bn.MAYTE,
    BenhNhan_Id = ba.BenhNhan_Id,
    TenBenhNhan = UPPER(bn.TENBENHNHAN),
    Tuoi        = YEAR(ba.NgayKham) - bn.NAMSINH,
    ba.ChanDoan,
    ba.ChanDoanICD,
    ba.TenBacSi,
    TenPhongBan = pb.TenPhongBan,
    SoCLS       = (SELECT COUNT(*) FROM dbo.DichVuYeuCau yc
                   WHERE yc.TIEPNHAN_ID = ba.TiepNhan_Id AND yc.HUYYEUCAU = 0),
    SoDonThuoc  = (SELECT COUNT(*) FROM dbo.KB_DonThuoc d WHERE d.BenhAn_Id = ba.BenhAn_Id)
FROM dbo.KB_BenhAn ba WITH (NOLOCK)
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK) ON ba.BenhNhan_Id = bn.BENHNHAN_ID
LEFT JOIN dbo.HangDoiPhongBan h WITH (NOLOCK) ON ba.HangDoiPhongBan_Id = h.HangDoiPhongBan_Id
LEFT JOIN dbo.DM_PhongBan pb WITH (NOLOCK) ON h.PhongBan_Id = pb.PhongBan_Id
WHERE CONVERT(date, ba.NgayKham) BETWEEN @TuNgay AND @DenNgay
  AND (@PhongBanId = 0 OR h.PhongBan_Id = @PhongBanId)
  AND (@Keyword = N'' OR bn.TENBENHNHAN LIKE N'%' + @Keyword + N'%'
       OR bn.MAYTE LIKE N'%' + @Keyword + N'%')
ORDER BY ba.NgayKham DESC, ba.BenhAn_Id DESC;",
            new
            {
                TuNgay = tuNgay.Date,
                DenNgay = denNgay.Date,
                PhongBanId = phongBanId,
                Keyword = keyword ?? "",
            });

    public Task<IEnumerable<dynamic>> GetDichVuByLoaiAsync(string loai)
        => _db.ListAsync(@"
SELECT DICHVU_ID, MADICHVU, TENDICHVU, DonGia, DonViTinh, LoaiDV, NHOMDICHVU_ID
FROM dbo.DM_DichVu WITH (NOLOCK)
WHERE TAMNGUNG = 0 AND LoaiDV = @Loai
ORDER BY TENDICHVU;", new { Loai = loai });

    // ── Helpers ───────────────────────────────────────────────────

    // Map nhóm dịch vụ → HangDoi. Dùng NHOMDICHVU_ID là CHÍNH (chắc chắn),
    // tên DV chỉ là fallback (mong manh vì "Xquang" ≠ "X-Quang"). DM_NhomDichVu:
    //   XN/lấy mẫu: 1 XN, 9 Vi sinh, 10 Hóa sinh, 13 Huyết học, 18 Nước Tiểu,
    //               25 labona, 1023/1025 XN tâm trí
    //   Siêu âm:    16, 1024
    //   X-Quang:    7 X-Quang DV, 8 X-Quang KTS, 1027 XQ tâm trí
    //   CT:         14;  MRI: 15 (gộp tạm X-Quang HD8)
    //   Đo loãng xương: 1020;  Điện tim: 1018/1028
    private static int MapNhomToHangDoi(int nhomId, string tenDv)
    {
        switch (nhomId)
        {
            case 16: case 1024: return 7;          // Siêu âm → HD7
            case 7: case 8: case 15: case 1027:    // X-Quang / MRI → HD8
            case 1018: case 1028:                  // Điện tim/cơ (gộp CDHA) → HD8
                return 8;
            case 14: return 10;                    // CT → HD10
            case 1020: return 9;                   // Đo loãng xương → HD9
            case 1: case 9: case 10: case 13:
            case 18: case 25: case 1023: case 1025:
                return 6;                          // XN / lấy mẫu → HD6
        }
        // Fallback theo tên nếu nhóm lạ (nhom 2 CĐHA chung...)
        string t = (tenDv ?? "").ToLowerInvariant();
        if (t.Contains("ct") || t.Contains("cắt lớp")) return 10;
        if (t.Contains("siêu âm")) return 7;
        if (t.Contains("xquang") || t.Contains("x-quang") || t.Contains("x quang")) return 8;
        if (t.Contains("loãng xương")) return 9;
        return 6; // mặc định XN
    }

    private static int MapNhomToPhongBan(int nhomId, string tenDv)
    {
        int hd = MapNhomToHangDoi(nhomId, tenDv);
        return hd switch
        {
            6 => 5,    // Phòng Lấy Mẫu XN
            7 => 6,    // Phòng Siêu Âm 1
            8 => 7,    // Phòng X-Quang
            9 => 10,   // Phòng Đo loãng xương (dùng SiêuÂm2)
            10 => 10,  // Phòng CT
            _ => 5,
        };
    }

    // PushToQueueAsync đã GỠ: mô hình doctor-transfer không auto-đẩy BN vào
    // hàng đợi nào lúc chỉ định nữa. CLS/CDHA vào hàng đợi qua quét phiếu
    // (Nhận bệnh); Viện phí/Nhà thuốc vào qua nút "Chuyển tiếp" của bác sĩ
    // (KhamBenhController.ChuyenSangVP/NT → SP_002 ChuyenSang...).
}
