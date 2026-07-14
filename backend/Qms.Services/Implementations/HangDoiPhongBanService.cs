using Qms.Core.DTOs;
using Qms.Core.Exceptions;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class HangDoiPhongBanService : IHangDoiPhongBanService
{
    private readonly IDatabaseHelper _db;

    public HangDoiPhongBanService(IDatabaseHelper db)
    {
        _db = db;
    }

    // ─── Helper ──────────────────────────────────────────────────────────────────

    private static string Now() => DateTime.Now.ToString("yyyyMMdd HH:mm:ss");
    private static string Today() => DateTime.Now.ToString("yyyyMMdd");
    private static string BuoiTrongNgay() => DateTime.Now.Hour <= 11 ? "Sang" : "Chieu";

    /// <summary>
    /// Chống thêm TRÙNG vào hàng chờ khi quét/nhập lại barcode: nếu phiếu
    /// (CLSYeuCau_Id) — hoặc bệnh nhân khi không có phiếu (viện phí) — đã có
    /// một bản ghi ĐANG HOẠT ĐỘNG (chưa hoàn tất, chưa huỷ) trong cùng hàng
    /// đợi hôm nay thì ném lỗi nghiệp vụ (FE hiện message, không thêm nữa).
    /// "Đang hoạt động" gồm cả đang chờ lẫn đã gọi (NgayGioHoanTat IS NULL).
    /// </summary>
    private async Task EnsureNotDuplicateCheckInAsync(int hangDoiId, int clsYeuCauId, int benhNhanId)
    {
        const string sql = @"
SELECT COUNT(*) FROM dbo.HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoi_Id = @HangDoiId
  AND ISNULL(Huy, 0) = 0
  AND NgayGioHoanTat IS NULL
  AND CONVERT(date, NgayThucHien) = CONVERT(date, GETDATE())
  AND (
       (@ClsYeuCauId > 0 AND CLSYeuCau_Id = @ClsYeuCauId)
    OR (@ClsYeuCauId = 0 AND @BenhNhanId > 0 AND BenhNhan_Id = @BenhNhanId)
  );";
        var count = await _db.ScalarAsync<int>(sql,
            new { HangDoiId = hangDoiId, ClsYeuCauId = clsYeuCauId, BenhNhanId = benhNhanId });
        if (count > 0)
            throw new AppException(ErrorCode.BUSINESS_RULE_VIOLATION,
                "Bệnh nhân/phiếu này đã có trong hàng chờ, không thể thêm lại.");
    }

    // ─── SP_002_HangDoiPhongBan ───────────────────────────────────────────────────

    public Task<IEnumerable<dynamic>> GetQueueListAsync(int userId)
        => _db.ListAsync("EXEC SP_002_HangDoiPhongBan @Action='CBBHangDoi', @User_Id=@UserId", new { UserId = userId });

    public Task<IEnumerable<dynamic>> GetLoaiUuTienAsync()
        => _db.ListAsync("EXEC SP_002_HangDoiPhongBan @Action='LoaiUuTien'");

    public Task<IEnumerable<dynamic>> DeleteBnCheckInAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'DeleteBnCheckIn', @HangDoiPhongBan_Id = @Id", new { Id = hangDoiPhongBanId });

    public Task<IEnumerable<dynamic>> BoQuaBnCheckInAsync(int hangDoiPhongBanId, UpdateBNRequest req)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'BoQuaBnCheckIn', @HangDoiPhongBan_Id = @Id, @PhongBan_Id = @PhongBanId",
            new { Id = hangDoiPhongBanId, PhongBanId = req.PhongBanId });

    public Task<IEnumerable<dynamic>> CBBHangDoiAsync(int userId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CBBHangDoi', @User_Id = @UserId", new { UserId = userId });

    public Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadAsync(int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ShowSTTDaThucHienLoad', @PhongBan_Id = @PhongBanId", new { PhongBanId = phongBanId });

    /// <summary>
    /// Giống SP_002 Action='ShowSTTDaThucHienLoad' nhưng filter thêm HangDoi_Id.
    /// SP gốc chỉ lọc theo PhongBan_Id — khi user ADMIN có chung 1 PhongBan cho
    /// nhiều module, mọi trang đều render cùng 1 STT đang gọi (bug 1002 trên
    /// Khám bệnh + CLS). Truyền cả HangDoi_Id để chỉ lấy BN đang gọi trong
    /// hàng đợi phù hợp với module trang.
    /// </summary>
    public Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadByHangDoiAsync(int hangDoiId, int phongBanId)
    {
        if (hangDoiId <= 0 || phongBanId <= 0)
            return Task.FromResult<IEnumerable<dynamic>>(Enumerable.Empty<dynamic>());

        const string sql = @"
DECLARE @ThoiGianThucHien datetime;
SELECT @ThoiGianThucHien = MAX(NgayGioThucHien)
FROM HangDoiPhongBan h WITH (NOLOCK)
WHERE TinhTrang = 1 AND Huy = 0
  AND PhongBan_Id = @PhongBanId
  AND HangDoi_Id  = @HangDoiId
  AND NgayThucHien = CONVERT(date, GETDATE());

IF @ThoiGianThucHien IS NOT NULL
BEGIN
    SELECT
        STT = SoThuTuDayDu,
        TENBENHNHAN = CASE WHEN UuTien = 1
            THEN UPPER(bn.TENBENHNHAN) + N'(Ưu tiên)'
            ELSE UPPER(bn.TENBENHNHAN) END,
        HangDoiPhongBan_Id,
        bn.NAMSINH
    FROM HangDoiPhongBan h WITH (NOLOCK)
    LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK) ON h.BenhNhan_Id = bn.BENHNHAN_ID
    WHERE TinhTrang = 1 AND Huy = 0
      AND PhongBan_Id = @PhongBanId
      AND HangDoi_Id  = @HangDoiId
      AND NgayThucHien = CONVERT(date, GETDATE())
      AND NgayGioThucHien = @ThoiGianThucHien;
END
ELSE
BEGIN
    SELECT STT = '', TENBENHNHAN = '', HangDoiPhongBan_Id = 0, NAMSINH = '';
END";
        return _db.ListAsync(sql, new { HangDoiId = hangDoiId, PhongBanId = phongBanId });
    }

    public Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadTachAsync(int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ShowSTTDaThucHienLoadTach', @PhongBan_Id = @PhongBanId", new { PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> CheckBenhNhanDaGoiAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CheckBenhNhanDaGoi', @HangDoiPhongBan_Id = @Id", new { Id = hangDoiPhongBanId });

    public Task<IEnumerable<dynamic>> CheckSTTDangChonTheoHangDoi_IdAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CheckSTTDangChonTheoHangDoi_Id', @HangDoiPhongBan_Id = @Id", new { Id = hangDoiPhongBanId });

    public Task<IEnumerable<dynamic>> STTTiepTheoCheckPhongBanAsync(int hangDoiId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'STTTiepTheoCheckPhongBan', @HangDoi_Id = @HangDoiId, @PhongBan_Id = @PhongBanId",
            new { HangDoiId = hangDoiId, PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> SelectDanhSachHangDoiTheoHangDoiIDAsync(int hangDoiId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'SelectDanhSachHangDoiTheoHangDoiID', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> SelectDanhSachHangDoiTheoHangDoiIDNewAsync(int hangDoiId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'SelectDanhSachHangDoiTheoHangDoiIDNew', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> LoadHangDoiPhongBanchuaGoiAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'LoadHangDoiPhongBanchuaGoi', @HangDoiPhongBan_Id = @Id, @NgayGioHoanTat = @Now",
            new { Id = hangDoiPhongBanId, Now = Now() });

    public Task<IEnumerable<dynamic>> CapNhatSTTHangDoiAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CapNhatSTTHangDoi', @HangDoiPhongBan_Id = @Id, @NgayGioHoanTat = @Now",
            new { Id = hangDoiPhongBanId, Now = Now() });

    public Task<IEnumerable<dynamic>> HoanTatBenhNhanCLSAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'HoanTatBenhNhanCLS', @HangDoiPhongBan_Id = @Id, @NgayGioHoanTat = @Now",
            new { Id = hangDoiPhongBanId, Now = Now() });

    public Task<IEnumerable<dynamic>> HoanTatBenhNhanTruocAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'HoanTatBenhNhanTruoc', @HangDoiPhongBan_Id = @Id, @NgayGioHoanTat = @Now",
            new { Id = hangDoiPhongBanId, Now = Now() });

    public Task<IEnumerable<dynamic>> GoiBenhNhanCLSAsync(int hangDoiPhongBanId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'GoiBenhNhanCLS', @HangDoiPhongBan_Id = @Id, @NgayGioThucHien = @Now, @PhongBan_Id = @PhongBanId",
            new { Id = hangDoiPhongBanId, Now = Now(), PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> CheckSoPhieuYeuCauNhanBenhvaInSTTAsync(string soPhieu, int hangDoiId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CheckSoPhieuYeuCauNhanBenhvaInSTT', @SoPhieuYeuCau = @SoPhieu, @HangDoi_Id = @HangDoiId",
            new { SoPhieu = soPhieu, HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> SelectDanhSachHangDoiPhongBanIDDaThucHienAsync(int hangDoiId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'SelectDanhSachHangDoiPhongBanIDDaThucHien', @PhongBan_Id = @PhongBanId, @HangDoi_Id = @HangDoiId",
            new { PhongBanId = phongBanId, HangDoiId = hangDoiId });

    // "Đã gọi" GIỮ cả BN đã hoàn tất hôm nay (nhật ký gọi số) — dùng cho Viện phí/Nhà thuốc.
    public Task<IEnumerable<dynamic>> SelectDaGoiTrongNgayAsync(int hangDoiId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'SelectDaGoiTrongNgay', @PhongBan_Id = @PhongBanId, @HangDoi_Id = @HangDoiId",
            new { PhongBanId = phongBanId, HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> ChayChuDanhSachChoAsync(int hangDoiId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ChayChuDanhSachCho', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> ChayChuDanhSachChoNewAsync(int hangDoiId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ChayChuDanhSachChoNew', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    public Task<IEnumerable<dynamic>> ShowSTTChuaThucHienTop10Async(int hangDoiId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ShowSTTChuaThucHienTop10', @HangDoi_Id = @HangDoiId", new { HangDoiId = hangDoiId });

    /// <summary>
    /// Danh sách BN trong hàng đợi Khám bệnh (HD=3) hôm nay — phù hợp trang
    /// /kham-benh/danh-sach (operator/quản lý xem tổng quan).
    /// SP_002 action 'DanhSachBenhNhan' gốc join DM_LoaiDichVu (không tồn tại
    /// ở QMS_DA standalone) + filter NOITIEPNHAN_ID = 8/117 + chỉ CDHA → trả 0
    /// rows và sai semantic. Query trực tiếp HangDoiPhongBan để KH-bệnh thấy
    /// đủ trạng thái (chờ / đang gọi / hoàn tất) trong ngày.
    /// </summary>
    public Task<IEnumerable<dynamic>> DanhSachBenhNhanAsync(int phongBanId = 0)
    {
        // phongBanId > 0 → lọc đúng phòng khám của bác sĩ đang login (mỗi BS
        // 1 phòng, không thấy BN phòng khác). phongBanId = 0 (ADMIN) → thấy hết.
        string phongFilter = phongBanId > 0 ? " AND h.PhongBan_Id = @PhongBanId" : "";
        string sql = @"
SELECT
    h.HangDoiPhongBan_Id,
    h.BenhNhan_Id,
    -- TiepNhan_Id: lượt tiếp nhận mới nhất của BN hôm nay (BenhAnService
    -- cần để link bệnh án + chỉ định CLS).
    TiepNhan_Id = (SELECT TOP 1 tn.TIEPNHAN_ID FROM dbo.TiepNhan tn WITH (NOLOCK)
                   WHERE tn.BENHNHAN_ID = h.BenhNhan_Id
                     AND CONVERT(date, tn.NGAYTIEPNHAN) = CONVERT(date, GETDATE())
                   ORDER BY tn.TIEPNHAN_ID DESC),
    h.STT,
    h.SoThuTuDayDu,
    h.HangDoi_Id,
    hd.TenHangDoi,
    h.PhongBan_Id,
    pb.TenPhongBan,
    bn.MaYTe,
    bn.TENBENHNHAN AS TenBenhNhan,
    bn.NAMSINH    AS NamSinh,
    Tuoi = YEAR(GETDATE()) - bn.NAMSINH,
    bn.GIOITINH   AS GioiTinhId,
    GioiTinh = CASE WHEN bn.GIOITINH = 1 THEN N'Nam'
                    WHEN bn.GIOITINH = 2 THEN N'Nữ' ELSE N'' END,
    bn.SODIENTHOAI AS SoDienThoai,
    h.UuTien,
    h.LoaiPhieu,
    h.NoiDung,
    h.NgayGioLaySo,
    h.NgayGioThucHien,
    h.NgayGioHoanTat,
    h.TinhTrang,
    TrangThai = CASE h.TinhTrang
                  WHEN 0 THEN N'Đang chờ'
                  WHEN 1 THEN N'Đã gọi'
                  WHEN 2 THEN N'Hoàn tất'
                  ELSE N'' END,
    -- Đã khám = đã lưu bệnh án cho lượt khám này → mới cho phép 'Chuyển tiếp'.
    DaKham = CASE WHEN EXISTS (SELECT 1 FROM dbo.KB_BenhAn ba WITH (NOLOCK)
                                WHERE ba.HangDoiPhongBan_Id = h.HangDoiPhongBan_Id)
                  THEN 1 ELSE 0 END,
    -- Thu tiền sau (chọn lúc Tiếp nhận): 1 = khám xong CHUYỂN Viện phí; 0 = thu
    -- trước → HOÀN TẤT (không qua VP). null = chưa rõ. Dùng để màn Khám gợi ý nút.
    ThuTienSau = (SELECT TOP 1 yc.THUTIENSAU FROM dbo.DichVuYeuCau yc WITH (NOLOCK)
                   WHERE yc.BENHNHAN_ID = h.BenhNhan_Id
                     AND CONVERT(date, yc.NGAYYEUCAU) = CONVERT(date, GETDATE())
                     AND yc.HUYYEUCAU = 0
                   ORDER BY yc.NGAYGIOYEUCAU DESC)
FROM dbo.HangDoiPhongBan h WITH (NOLOCK)
LEFT JOIN dbo.DM_HangDoi hd WITH (NOLOCK)
       ON h.HangDoi_Id = hd.HangDoi_Id
LEFT JOIN dbo.DM_PhongBan pb WITH (NOLOCK)
       ON h.PhongBan_Id = pb.PhongBan_Id
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK)
       ON h.BenhNhan_Id = bn.BENHNHAN_ID
WHERE h.HangDoi_Id = 3
  AND CONVERT(DATE, h.NgayThucHien) = CONVERT(DATE, GETDATE())
  AND h.Huy = 0" + phongFilter + @"
ORDER BY
    CASE h.TinhTrang WHEN 1 THEN 0 WHEN 0 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
    h.UuTien DESC,
    h.STT DESC;";
        // Sắp xếp worklist: đã gọi (đang khám) → đang chờ → hoàn tất; trong
        // mỗi nhóm BN mới vào (STT lớn) lên đầu. Người vừa gọi luôn ở trên cùng.
        return _db.ListAsync(sql, new { PhongBanId = phongBanId });
    }

    /// <summary>
    /// Danh sách BN nội trú ĐÃ check-in CLS hôm nay (phù hợp UX trang
    /// /cls/noi-tru/check-in). SP gốc 'DanhSachBenhNhanNoiTru' trả về danh
    /// sách BN có CLS *chờ* check-in tiếp (logic NOT EXISTS phức tạp), không
    /// hữu ích cho operator vì sau khi check-in thành công BN biến mất.
    /// Query trực tiếp HangDoiPhongBan + join TT_BENHNHAN để KTV thấy lịch
    /// sử check-in trong ngày.
    /// </summary>
    public Task<IEnumerable<dynamic>> DanhSachBenhNhanNoiTruAsync()
    {
        const string sql = @"
SELECT
    h.HangDoiPhongBan_Id,
    h.STT,
    h.SoThuTuDayDu,
    h.HangDoi_Id,
    hd.TenHangDoi,
    h.NoiDung,
    h.SoLuongChiDinh,
    h.LoaiPhieu,
    h.NgayGioLaySo,
    h.NgayGioThucHien,
    h.NgayGioHoanTat,
    h.TinhTrang,
    h.TinhTrangHienTai,
    bn.MaYTe,
    bn.SoVaoVien,
    bn.TENBENHNHAN AS TenBenhNhan,
    bn.NAMSINH    AS NamSinh
FROM HangDoiPhongBan h WITH (NOLOCK)
LEFT JOIN DM_HangDoi hd WITH (NOLOCK)
       ON h.HangDoi_Id = hd.HangDoi_Id
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK)
       ON h.BenhNhan_Id = bn.BENHNHAN_ID
WHERE CONVERT(DATE, h.NgayGioLaySo) = CONVERT(DATE, GETDATE())
  AND (h.LoaiPhieu = N'NoiTru' OR h.LoaiPhieu = N'Nội trú')
  AND h.HangDoi_Id IN (7, 8, 9, 10, 15)
  AND h.Huy = 0
ORDER BY h.NgayGioLaySo DESC";
        return _db.ListAsync(sql);
    }

    public Task<IEnumerable<dynamic>> CheckBenhNhanCoCLSNoiTruAsync(string maYTe)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CheckBenhNhanCoCLSNoiTru', @SoPhieuYeuCau = @MaYTe", new { MaYTe = maYTe });

    public Task<IEnumerable<dynamic>> BenhNhanCheckInCLSNoiTruAsync(string maYTe)
        => _db.ListAsync("exec sp_006_BenhNhanCheckInCLSNoiTru @MaBenhNhan = @MaYTe", new { MaYTe = maYTe });

    public Task<IEnumerable<dynamic>> GoiBenhNhanAsync(int hangDoiPhongBanId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'GoiBenhNhan', @HangDoiPhongBan_Id = @Id, @NgayGioThucHien = @Now, @PhongBan_Id = @PhongBanId",
            new { Id = hangDoiPhongBanId, Now = Now(), PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> ChuyenSangNhaThuocAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ChuyenSangNhaThuoc', @HangDoiPhongBan_Id = @Id, @NgayGioLaySo = @Now",
            new { Id = hangDoiPhongBanId, Now = Now() });

    public Task<IEnumerable<dynamic>> ChuyenSangVienPhiAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ChuyenSangVienPhi', @HangDoiPhongBan_Id = @Id, @NgayGioLaySo = @Now",
            new { Id = hangDoiPhongBanId, Now = Now() });

    // Thu ngân "Thu xong" lượt VIỆN PHÍ: đóng lượt VP (TinhTrang=2) + nếu BN có
    // ĐƠN THUỐC hôm nay → TỰ ĐẨY sang Nhà thuốc (mô hình tuần tự: trả tiền TRƯỚC,
    // lấy thuốc SAU). ChuyenSangNhaThuocAsync đã có dedup + gán PhongBan_Id=9.
    public async Task<IEnumerable<dynamic>> HoanTatThuTienAsync(int hangDoiPhongBanId)
    {
        var bnId = await _db.ScalarAsync<int?>(
            "SELECT BenhNhan_Id FROM dbo.HangDoiPhongBan WHERE HangDoiPhongBan_Id = @Id",
            new { Id = hangDoiPhongBanId });

        await _db.ExecuteAsync(@"
UPDATE dbo.HangDoiPhongBan
SET TinhTrang = 2, NgayGioHoanTat = GETDATE(),
    NoiDungDaThucHien = ISNULL(NoiDungDaThucHien, N'') + N' [Đã thu viện phí]'
WHERE HangDoiPhongBan_Id = @Id AND Huy = 0 AND TinhTrang <> 2",
            new { Id = hangDoiPhongBanId });

        bool coThuoc = false;
        if (bnId.HasValue)
        {
            coThuoc = await _db.ScalarAsync<int>(@"
SELECT COUNT(*) FROM dbo.KB_DonThuoc WITH (NOLOCK)
WHERE BenhNhan_Id = @Bn AND CONVERT(date, NgayKe) = CONVERT(date, GETDATE())
  AND (TrangThai IS NULL OR TrangThai <> N'Huy')",
                new { Bn = bnId.Value }) > 0;
            if (coThuoc)
                await ChuyenSangNhaThuocAsync(hangDoiPhongBanId);
        }

        return new dynamic[] { new { hoanTat = true, daDayNhaThuoc = coThuoc, benhNhanId = bnId } };
    }

    // Lấy TiepNhan_Id + BenhNhan_Id của 1 lượt hàng đợi (để màn Viện phí mở hoá đơn
    // cho BN đang gọi — đang-gọi chỉ có HangDoiPhongBan_Id).
    public Task<IEnumerable<dynamic>> GetThanhToanInfoAsync(int hangDoiPhongBanId)
        => _db.ListAsync(@"
SELECT TOP 1
    benhNhanId = h.BenhNhan_Id,
    tiepNhanId = (SELECT TOP 1 tn.TIEPNHAN_ID FROM dbo.TiepNhan tn WITH (NOLOCK)
                  WHERE tn.BENHNHAN_ID = h.BenhNhan_Id
                    AND CONVERT(date, tn.NGAYTIEPNHAN) = CONVERT(date, GETDATE())
                  ORDER BY tn.TIEPNHAN_ID DESC)
FROM dbo.HangDoiPhongBan h WITH (NOLOCK)
WHERE h.HangDoiPhongBan_Id = @Id",
            new { Id = hangDoiPhongBanId });

    // Hoàn tất lượt khám (HD=3): set TinhTrang=2 + giờ hoàn tất. Gọi khi bác
    // sĩ "Chuyển tiếp" hoặc bấm "Hoàn tất". Guard TinhTrang<>2 để idempotent
    // (chuyển "cả hai" gọi 2 lần). SP_002 ChuyenSang... KHÔNG tự đóng lượt
    // khám nên phải đóng ở đây.
    public Task<int> HoanTatLuotKhamAsync(int hangDoiPhongBanId)
        => _db.ExecuteAsync(@"
UPDATE dbo.HangDoiPhongBan
SET TinhTrang = 2, NgayGioHoanTat = GETDATE(),
    NoiDungDaThucHien = ISNULL(NoiDungDaThucHien, N'') + N' [Đã khám xong]'
WHERE HangDoiPhongBan_Id = @Id AND Huy = 0 AND TinhTrang <> 2",
            new { Id = hangDoiPhongBanId });

    public Task<IEnumerable<dynamic>> CheckSoPhieuYeuCauNhanBenhVienPhiAsync(string soPhieuYeuCau)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'CheckSoPhieuYeuCauNhanBenhVienPhi', @SoPhieuYeuCau = @SoPhieu",
            new { SoPhieu = soPhieuYeuCau });

    public Task<IEnumerable<dynamic>> STTTiepTheoCheckPhongBanNewAsync(int hangDoiId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'STTTiepTheoCheckPhongBanNew', @HangDoi_Id = @HangDoiId, @PhongBan_Id = @PhongBanId",
            new { HangDoiId = hangDoiId, PhongBanId = phongBanId });

    public Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadXetNghiemAsync(int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'ShowSTTDaThucHienLoadXetNghiem', @PhongBan_Id = @PhongBanId", new { PhongBanId = phongBanId });

    // ─── VienPhi ─────────────────────────────────────────────────────────────────

    public async Task<IEnumerable<dynamic>> ThemBnCheckInVPAsync(ThemBnCheckInVpReq req)
    {
        // VP không có phiếu CLS → chống trùng theo BenhNhan_Id (1 BN 1 lượt đang chờ).
        await EnsureNotDuplicateCheckInAsync(req.HangDoiId, 0, req.BenhNhanId);
        string sql = "exec SP_002_HangDoiPhongBan @Action = N'ThemBnCheckIn', " +
            "@HangDoi_Id = @HangDoiId, @PhongBan_Id = NULL, @STT = NULL, @SoThuTuDayDu = NULL, " +
            "@UuTien = @UuTien, @YeuCau = 0, @TinhTrang = 0, " +
            "@NgayThucHien = @NgayThucHien, @NgayGioLaySo = @NgayGioLaySo, " +
            "@NgayGioThucHien = NULL, @NgayGioHoanTat = NULL, " +
            "@BenhNhan_Id = @BenhNhanId, @CLSYeuCau_Id = NULL, @LoaiPhieu = @LoaiPhieu, " +
            "@Huy = 0, @NoiDung = @NoiDung, @ThoiGian = @ThoiGian, " +
            "@SoLuongChiDinh = NULL, @ViTriHienTai = N'Khu CLS', " +
            "@TinhTrangHienTai = N'Đợi thực hiện CLS', @Khoa = 0, @LoaiUuTien = NULL";

        return await _db.ListAsync(sql, new {
            HangDoiId = req.HangDoiId,
            UuTien = req.UuTien,
            NgayThucHien = Today(),
            NgayGioLaySo = Now(),
            BenhNhanId = req.BenhNhanId,
            LoaiPhieu = req.LoaiPhieu,
            NoiDung = req.NoiDung,
            ThoiGian = BuoiTrongNgay()
        });
    }

    // ─── CLS ─────────────────────────────────────────────────────────────────────

    public async Task<IEnumerable<dynamic>> ThemBnCheckInCLSAsync(ThemBnCheckInClsReq req)
    {
        await EnsureNotDuplicateCheckInAsync(req.HangDoiId, req.ClsYeuCauId, req.BenhNhanId);
        string sql = "exec SP_002_HangDoiPhongBan @Action = N'ThemBnCheckIn', " +
            "@HangDoi_Id = @HangDoiId, @PhongBan_Id = NULL, @STT = NULL, @SoThuTuDayDu = NULL, " +
            "@UuTien = @UuTien, @YeuCau = 0, @TinhTrang = 0, " +
            "@NgayThucHien = @NgayThucHien, @NgayGioLaySo = @NgayGioLaySo, " +
            "@NgayGioThucHien = NULL, @NgayGioHoanTat = NULL, " +
            "@BenhNhan_Id = @BenhNhanId, @CLSYeuCau_Id = @ClsYeuCauId, @LoaiPhieu = @LoaiPhieu, " +
            "@Huy = 0, @NoiDung = @NoiDung, @ThoiGian = @ThoiGian, " +
            "@SoLuongChiDinh = @SoLuong, @ViTriHienTai = N'Khu CLS', " +
            "@TinhTrangHienTai = N'Đợi thực hiện CLS', @Khoa = 0, @LoaiUuTien = NULL";

        return await _db.ListAsync(sql, new {
            HangDoiId = req.HangDoiId,
            UuTien = req.UuTien,
            NgayThucHien = Today(),
            NgayGioLaySo = Now(),
            BenhNhanId = req.BenhNhanId,
            ClsYeuCauId = req.ClsYeuCauId,
            LoaiPhieu = req.LoaiPhieu,
            NoiDung = req.NoiDung,
            ThoiGian = BuoiTrongNgay(),
            SoLuong = req.SoLuongChiDinh
        });
    }

    public Task<IEnumerable<dynamic>> UpdateBnCheckInCLSAsync(UpdateNhanBenhCLSRequest req)
    {
        string sql = "exec SP_002_HangDoiPhongBan @Action = N'UpdateBnCheckIn', " +
            "@HangDoi_Id = @HangDoiId, @PhongBan_Id = NULL, @STT = NULL, @SoThuTuDayDu = NULL, " +
            "@UuTien = @UuTien, @YeuCau = 0, @TinhTrang = 0, " +
            "@NgayThucHien = @NgayThucHien, @NgayGioLaySo = @NgayGioLaySo, " +
            "@NgayGioThucHien = NULL, @NgayGioHoanTat = NULL, " +
            "@BenhNhan_Id = NULL, @CLSYeuCau_Id = NULL, @LoaiPhieu = NULL, " +
            "@Huy = 0, @HangDoiPhongBan_Id = @HangDoiPhongBanId, " +
            "@NoiDung = @NoiDung, @ThoiGian = @ThoiGian, @SoLuongChiDinh = @SoLuong";

        string thoiGian = string.IsNullOrWhiteSpace(req.ThoiGian) ? BuoiTrongNgay() : req.ThoiGian;
        int uuTien = req.UuTien ?? 0;
        int soLuong = req.SoLuongChiDinh ?? 1;
        string noiDung = req.NoiDung ?? "";

        return _db.ListAsync(sql, new {
            HangDoiId = req.HangDoiId,
            UuTien = uuTien,
            NgayThucHien = Today(),
            NgayGioLaySo = Now(),
            HangDoiPhongBanId = req.HangDoiPhongBanId,
            NoiDung = noiDung,
            ThoiGian = thoiGian,
            SoLuong = soLuong
        });
    }

    // ─── Custom SQL ───────────────────────────────────────────────────────────────

    public Task<IEnumerable<dynamic>> CBBPhongBanAsync(int userId)
    {
        const string sql = """
            SELECT
                FieldCode = p.PhongBan_Id,
                p.TenPhongBanDayDu,
                FieldName = upper(p.TenPhongBan)
            FROM DM_PhongBan p WITH (NOLOCK)
            INNER JOIN Sys_Users_PhongBan s WITH (NOLOCK)
                    ON p.PhongBan_Id = s.PhongBan_Id
            WHERE p.Huy = 0
              AND p.TamNgung = 0
              AND s.User_Id = @UserId
            ORDER BY p.PhongBan_Id
            """;
        return _db.ListAsync(sql, new { UserId = userId });
    }

    // ─── Composed logic (mirrors Java processXxx methods) ─────────────────────────

    public async Task<IEnumerable<dynamic>> ProcessMoiBNAsync(int hangDoiId, int phongBanId)
    {
        var rows = await STTTiepTheoCheckPhongBanAsync(hangDoiId, phongBanId);
        var first = rows.FirstOrDefault();
        if (first == null) return Array.Empty<dynamic>();
        var dict = (IDictionary<string, object>)first;
        if (!dict.TryGetValue("HangDoiPhongBan_Id", out var id) || id == null) return Array.Empty<dynamic>();
        return await GoiBenhNhanAsync(Convert.ToInt32(id), phongBanId);
    }

    public async Task<IEnumerable<dynamic>> ProcessBoQuaBNAsync(int hangDoiPhongBanId, int phongBanId)
    {
        var rows = await CheckSTTDangChonTheoHangDoi_IdAsync(hangDoiPhongBanId);
        var first = rows.FirstOrDefault();
        if (first == null) return Array.Empty<dynamic>();
        var dict = (IDictionary<string, object>)first;
        if (dict.TryGetValue("TinhTrang", out var t) && t?.ToString() == "0")
            return await BoQuaBnCheckInInternalAsync(hangDoiPhongBanId, phongBanId);
        return Array.Empty<dynamic>();
    }

    public async Task<IEnumerable<dynamic>> ProcessMoiBNCLSAsync(int hangDoiId, int phongBanId, int hangDoiPhongBanId)
    {
        var sttRows = await STTTiepTheoCheckPhongBanNewAsync(hangDoiId, phongBanId);
        var first = sttRows.FirstOrDefault();
        if (first == null)
        {
            await HoanTatBenhNhanTruocAsync(hangDoiPhongBanId);
            return Array.Empty<dynamic>();
        }
        var dict = (IDictionary<string, object>)first;
        if (!dict.TryGetValue("HangDoiPhongBan_Id", out var idObj) || idObj == null)
        {
            await HoanTatBenhNhanTruocAsync(hangDoiPhongBanId);
            return Array.Empty<dynamic>();
        }
        int nextId = Convert.ToInt32(idObj);

        // Mirror WinForms CLSGoiBenh.cs: với mỗi row trong LoadHangDoiPhongBanchuaGoi,
        // cập nhật STT theo ID của row (không phải ID input).
        var loadRows = await LoadHangDoiPhongBanchuaGoiAsync(hangDoiPhongBanId);
        foreach (var row in loadRows)
        {
            var r = (IDictionary<string, object>)row;
            if (r.TryGetValue("HangDoiPhongBan_Id", out var rId) && rId != null)
            {
                int rowId = Convert.ToInt32(rId);
                if (rowId > 0) await CapNhatSTTHangDoiAsync(rowId);
            }
        }

        await HoanTatBenhNhanCLSAsync(hangDoiPhongBanId);
        var result = await GoiBenhNhanCLSAsync(nextId, phongBanId);
        return result ?? Array.Empty<dynamic>();
    }

    public async Task<object> ProcessGoiBenhNhanDaChonCLSAsync(int hangDoiPhongBanId, int phongBanId)
    {
        var rows = await CheckSTTDangChonTheoHangDoi_IdAsync(hangDoiPhongBanId);
        var first = rows.FirstOrDefault();
        if (first == null) return new { action = "NONE", data = Array.Empty<dynamic>() };

        var dict = (IDictionary<string, object>)first;
        string tinhTrang = dict.TryGetValue("TinhTrang", out var t) ? t?.ToString() ?? "" : "";

        if (tinhTrang == "0")
        {
            var res = await GoiBenhNhanAsync(hangDoiPhongBanId, phongBanId);
            return new { action = "GOI_BN", data = res ?? Array.Empty<dynamic>() };
        }

        var res2 = await ShowSTTDaThucHienLoadAsync(phongBanId);
        return new { action = "GOI_LAI", data = res2 ?? Array.Empty<dynamic>() };
    }

    /// <summary>
    /// Tách 2 nhánh khi click Gọi lại từ list "Đã qua lượt"
    /// (tương ứng WinForms KhamBenh.cs line 519-551 / CLSGoiBenh button gọi lại):
    /// - TinhTrang=0 (BN bị bỏ qua, chưa gọi): xử lý như gọi mới (GoiBenhNhan).
    /// - TinhTrang khác 0 (đã gọi rồi): chỉ broadcast GoiLai + return STT đang gọi.
    /// </summary>
    public async Task<object> ProcessGoiLaiBNAsync(int hangDoiPhongBanId, int phongBanId)
    {
        var rows = await CheckSTTDangChonTheoHangDoi_IdAsync(hangDoiPhongBanId);
        var first = rows.FirstOrDefault();
        if (first == null) return new { action = "NONE", data = Array.Empty<dynamic>() };

        var dict = (IDictionary<string, object>)first;
        string tinhTrang = dict.TryGetValue("TinhTrang", out var t) ? t?.ToString() ?? "" : "";

        if (tinhTrang == "0")
        {
            var res = await GoiBenhNhanAsync(hangDoiPhongBanId, phongBanId);
            return new { action = "GOI_BN", data = res ?? Array.Empty<dynamic>() };
        }

        var res2 = await ShowSTTDaThucHienLoadAsync(phongBanId);
        return new { action = "GOI_LAI", data = res2 ?? Array.Empty<dynamic>() };
    }

    // ─── Private ──────────────────────────────────────────────────────────────────

    private Task<IEnumerable<dynamic>> BoQuaBnCheckInInternalAsync(int hangDoiPhongBanId, int phongBanId)
        => _db.ListAsync("exec SP_002_HangDoiPhongBan @Action = N'BoQuaBnCheckIn', @HangDoiPhongBan_Id = @Id, @PhongBan_Id = @PhongBanId",
            new { Id = hangDoiPhongBanId, PhongBanId = phongBanId });

    // ─── Kiosk ThemBnCheckIn ───────────────────────────────────────────────────────
    // Java KioskController.java line 88: hangDoiPhongBanService.processThemBnCheckIn(req)
    // Java HangDoiPhongBanService.java line 525-541
    public async Task<IEnumerable<dynamic>> ThemBnCheckInAsync(ThemBnCheckInRequest req)
    {
        string sql = "exec SP_002_HangDoiPhongBan @Action = N'ThemBnCheckIn', " +
            "@HangDoi_Id = @HangDoiId, @PhongBan_Id = NULL, @STT = NULL, @SoThuTuDayDu = NULL, " +
            "@UuTien = @UuTien, @YeuCau = 0, @TinhTrang = 0, " +
            "@NgayThucHien = @NgayThucHien, @NgayGioLaySo = @NgayGioLaySo, " +
            "@NgayGioThucHien = NULL, @NgayGioHoanTat = NULL, " +
            "@BenhNhan_Id = NULL, @CLSYeuCau_Id = NULL, @LoaiPhieu = N'NgoaiTru', " +
            "@Huy = 0, @NoiDung = N'Lấy số tiếp nhận', @ThoiGian = @ThoiGian, " +
            "@SoLuongChiDinh = 1, @ViTriHienTai = N'Quầy Tiếp Nhận', " +
            "@TinhTrangHienTai = N'Chưa tiếp nhận, Đợi ở sảnh', @Khoa = 0, @LoaiUuTien = @LoaiUuTien";

        var inserted = await _db.ListAsync(sql, new {
            HangDoiId = req.HangDoiId,
            UuTien = req.UuTien,
            NgayThucHien = Today(),
            NgayGioLaySo = Now(),
            ThoiGian = BuoiTrongNgay(),
            LoaiUuTien = req.LoaiUuTien
        });

        // SP chỉ trả HangDoiPhongBan_Id; FE Kiosk cần thêm STT + SoThuTuDayDu
        // để hiển thị popup QR. Query lại row vừa insert để bổ sung.
        var first = inserted.FirstOrDefault();
        if (first == null) return inserted;
        var dict = (IDictionary<string, object>)first;
        if (!dict.TryGetValue("HangDoiPhongBan_Id", out var idObj) || idObj == null)
            return inserted;

        int id = Convert.ToInt32(idObj);
        const string fillSql = @"
SELECT HangDoiPhongBan_Id, STT, SoThuTuDayDu, HangDoi_Id, UuTien, NgayGioLaySo
FROM HangDoiPhongBan WITH (NOLOCK)
WHERE HangDoiPhongBan_Id = @Id";
        var full = await _db.ListAsync(fillSql, new { Id = id });
        return full;
    }

    // Gắn BenhNhan_Id vào lượt "lấy số nhanh" (ẩn danh) + đánh dấu hoàn tất bước
    // tiếp nhận → QR (?id=) của lượt này tự nâng lên theo dõi cả hành trình sang Khám.
    public Task<int> LinkBenhNhanAsync(int hangDoiPhongBanId, int benhNhanId)
        => _db.ExecuteAsync(@"
UPDATE HangDoiPhongBan
SET BenhNhan_Id = @Bn,
    NgayGioHoanTat = ISNULL(NgayGioHoanTat, GETDATE())
WHERE HangDoiPhongBan_Id = @Id AND ISNULL(BenhNhan_Id, 0) = 0",
            new { Id = hangDoiPhongBanId, Bn = benhNhanId });
}
