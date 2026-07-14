using System.Transactions;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;

namespace Qms.Services.Implementations;

public class WorkflowService : IWorkflowService
{
    private readonly IDatabaseHelper _db;
    public WorkflowService(IDatabaseHelper db) => _db = db;

    // ════════════════════════════════════════════════════════════
    // CLS / CDHA — KTV trả kết quả
    // ════════════════════════════════════════════════════════════

    public Task<dynamic?> GetCLSPendingByHdpbAsync(int hdpbId)
        => _db.OneAsync(@"
SELECT
    h.HangDoiPhongBan_Id, h.BenhNhan_Id, h.CLSYeuCau_Id AS DVYEUCAU_ID,
    h.NoiDung, h.SoThuTuDayDu, h.TinhTrang,
    bn.MaYTe, bn.TENBENHNHAN AS TenBenhNhan, bn.NAMSINH AS NamSinh,
    yc.SOPHIEUYEUCAU, dv.TENDICHVU, dv.LoaiDV, dv.DonGia,
    kq.KetQua_Id AS DaCoKetQua, kq.KetLuan AS KetLuanCu
FROM dbo.HangDoiPhongBan h WITH (NOLOCK)
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK) ON h.BenhNhan_Id = bn.BENHNHAN_ID
LEFT JOIN dbo.DichVuYeuCau yc WITH (NOLOCK) ON h.CLSYeuCau_Id = yc.DVYEUCAU_ID
LEFT JOIN dbo.DM_DichVu dv WITH (NOLOCK) ON yc.DICHVU_ID = dv.DICHVU_ID
LEFT JOIN dbo.KB_KetQuaCLS kq WITH (NOLOCK) ON yc.DVYEUCAU_ID = kq.DVYEUCAU_ID
WHERE h.HangDoiPhongBan_Id = @Id;",
            new { Id = hdpbId });

    public async Task<int> TraKetQuaCLSAsync(TraKetQuaCLSReq req, int ktvId, string? ktvName)
    {
        if (req.DVYEUCAU_ID <= 0) throw new ArgumentException("Thiếu DVYEUCAU_ID");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        var now = DateTime.Now;

        // Lấy BN_Id từ DichVuYeuCau
        int bnId = await _db.ScalarAsync<int>(
            "SELECT ISNULL(BENHNHAN_ID, 0) FROM dbo.DichVuYeuCau WHERE DVYEUCAU_ID = @Id",
            new { Id = req.DVYEUCAU_ID });
        if (bnId == 0) throw new ArgumentException("DVYEUCAU_ID không tồn tại");

        // INSERT KB_KetQuaCLS
        int kqId = await _db.ScalarAsync<int>(@"
INSERT INTO dbo.KB_KetQuaCLS
    (DVYEUCAU_ID, BenhNhan_Id, KTV_Id, TenKTV,
     KetLuan, KetQuaChiTiet, FileDinhKem, TrangThai, NgayTra)
VALUES
    (@DVY, @BN, @KTV, @TenKTV,
     @KL, @CT, @File, N'CoKetQua', @Now);
SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new
            {
                DVY = req.DVYEUCAU_ID,
                BN = bnId,
                KTV = ktvId,
                TenKTV = ktvName ?? "",
                KL = req.KetLuan,
                CT = req.KetQuaChiTiet,
                File = req.FileDinhKem,
                Now = now,
            });

        // Update DichVuYeuCau.TRANGTHAI = CoKetQua
        await _db.ExecuteAsync(
            "UPDATE dbo.DichVuYeuCau SET TRANGTHAI = N'CoKetQua', NGAYCAPNHAT = @Now WHERE DVYEUCAU_ID = @Id",
            new { Now = now, Id = req.DVYEUCAU_ID });

        // Mark HangDoiPhongBan hoàn tất
        if (req.HangDoiPhongBan_Id > 0)
        {
            await _db.ExecuteAsync(@"
UPDATE dbo.HangDoiPhongBan
SET TinhTrang = 2, NgayGioHoanTat = @Now,
    NoiDungDaThucHien = ISNULL(NoiDungDaThucHien, N'') + N' [Đã trả KQ]'
WHERE HangDoiPhongBan_Id = @Id;",
                new { Now = now, Id = req.HangDoiPhongBan_Id });
        }

        scope.Complete();
        return kqId;
    }

    // ════════════════════════════════════════════════════════════
    // Viện phí — Hóa đơn + Thu tiền
    // ════════════════════════════════════════════════════════════

    /// <summary>
    /// Trả về draft hóa đơn cho TiepNhan_Id — tổng hợp 3 loại phí:
    ///   - Khám bệnh: lượt khám HD=3 hôm nay của TN (DonGia mặc định 100k)
    ///   - CLS/CDHA: từ DichVuYeuCau (chưa thu)
    ///   - Thuốc: từ KB_DonThuoc (ChoPhat)
    /// </summary>
    public async Task<dynamic?> GetHoaDonDraftAsync(int tiepNhanId)
    {
        // Đã có HoaDon chưa?
        var existing = await GetHoaDonByTiepNhanAsync(tiepNhanId);
        if (existing != null) return existing;

        // Khám phí: lấy giá DV khám đầu tiên (mặc định 100k)
        var khamRows = await _db.ListAsync(@"
SELECT TOP 1 dv.DICHVU_ID, dv.TENDICHVU, dv.DonGia
FROM dbo.DM_DichVu dv WITH (NOLOCK)
WHERE dv.LoaiDV = N'KhamBenh' AND dv.TAMNGUNG = 0
ORDER BY dv.DonGia DESC;");
        var khamDv = khamRows.FirstOrDefault();

        // CLS/CDHA chỉ định cho TN
        var clsRows = await _db.ListAsync(@"
SELECT yc.DVYEUCAU_ID AS RefId, dv.TENDICHVU, dv.DonGia, dv.LoaiDV
FROM dbo.DichVuYeuCau yc WITH (NOLOCK)
LEFT JOIN dbo.DM_DichVu dv WITH (NOLOCK) ON yc.DICHVU_ID = dv.DICHVU_ID
WHERE yc.TIEPNHAN_ID = @T AND yc.HUYYEUCAU = 0
  -- tránh tính TRÙNG phí khám (KhamBenh đã cộng riêng ở khối khamDv phía trên)
  AND ISNULL(dv.LoaiDV, N'') <> N'KhamBenh';",
            new { T = tiepNhanId });

        // Thuốc theo TN
        var thuocRows = await _db.ListAsync(@"
SELECT dt.DonThuoc_Id AS RefId, dt.TongTien AS ThanhTien
FROM dbo.KB_DonThuoc dt WITH (NOLOCK)
WHERE dt.TiepNhan_Id = @T AND dt.TrangThai = N'ChoPhat';",
            new { T = tiepNhanId });

        var items = new List<object>();
        decimal tongTien = 0;

        if (khamDv != null)
        {
            var k = (IDictionary<string, object>)khamDv;
            decimal dg = Convert.ToDecimal(k["DonGia"] ?? 0);
            items.Add(new { Loai = "KhamBenh", RefId = (int?)null, TenDichVu = k["TENDICHVU"], SoLuong = 1, DonGia = dg, ThanhTien = dg });
            tongTien += dg;
        }

        foreach (var r in clsRows)
        {
            var d = (IDictionary<string, object>)r;
            decimal dg = Convert.ToDecimal(d["DonGia"] ?? 0);
            items.Add(new
            {
                Loai = d["LoaiDV"]?.ToString() ?? "CLS",
                RefId = (int?)Convert.ToInt32(d["RefId"]),
                TenDichVu = d["TENDICHVU"],
                SoLuong = 1,
                DonGia = dg,
                ThanhTien = dg,
            });
            tongTien += dg;
        }

        foreach (var r in thuocRows)
        {
            var d = (IDictionary<string, object>)r;
            decimal dg = Convert.ToDecimal(d["ThanhTien"] ?? 0);
            items.Add(new
            {
                Loai = "Thuoc",
                RefId = (int?)Convert.ToInt32(d["RefId"]),
                TenDichVu = "Đơn thuốc",
                SoLuong = 1,
                DonGia = dg,
                ThanhTien = dg,
            });
            tongTien += dg;
        }

        // BHYT theo ĐỐI TƯỢNG của BN → gợi ý số BHYT chi trả TỰ ĐỘNG (tỷ lệ × tổng).
        int bnId = await _db.ScalarAsync<int?>(
            "SELECT TOP 1 BENHNHAN_ID FROM dbo.TiepNhan WITH (NOLOCK) WHERE TIEPNHAN_ID = @T ORDER BY TIEPNHAN_ID DESC",
            new { T = tiepNhanId }) ?? 0;
        decimal tyLe = 0;
        string? tenDoiTuong = null;
        if (bnId > 0)
        {
            var bhytRow = await _db.OneAsync(@"
SELECT TOP 1 dt.TYLE_BHYT AS TyLe, dt.TenDoiTuong AS Ten
FROM dbo.BenhNhan_BHYT b WITH (NOLOCK)
JOIN dbo.DM_DoiTuong dt WITH (NOLOCK) ON b.LOAIBHYT = dt.DoiTuong_Id
WHERE b.BENHNHAN_ID = @Bn
  AND (b.TAMNGUNG IS NULL OR b.TAMNGUNG <> '1')
  AND (b.NGAYHETHIEULUC IS NULL OR b.NGAYHETHIEULUC >= CAST(GETDATE() AS date))
ORDER BY b.NGAYHIEULUC DESC", new { Bn = bnId });
            if (bhytRow != null)
            {
                var bd = (IDictionary<string, object>)bhytRow;
                tyLe = bd["TyLe"] != null ? Convert.ToDecimal(bd["TyLe"]) : 0;
                tenDoiTuong = bd["Ten"]?.ToString();
            }
        }

        return new
        {
            TiepNhan_Id = tiepNhanId,
            BenhNhan_Id = bnId,
            TongTienGoc = tongTien,
            BenhNhan_PhaiThu = tongTien,
            DaCoHoaDon = false,
            TyLeBhyt = tyLe,
            TenDoiTuong = tenDoiTuong,
            BhytChiTraGoiY = Math.Round(tongTien * tyLe, 0),
            Items = items,
        };
    }

    // Danh sách HOÁ ĐƠN ĐÃ THU hôm nay (để xem lại / in lại).
    public Task<IEnumerable<dynamic>> GetHoaDonDaThuAsync()
        => _db.ListAsync(@"
SELECT hd.HoaDon_Id, hd.SoHoaDon, hd.TiepNhan_Id, hd.BenhNhan_Id,
       bn.TENBENHNHAN AS TenBenhNhan,
       hd.TongTienGoc, hd.MienGiam, hd.BHYT_ChiTra, hd.BenhNhan_PhaiThu,
       hd.NgayThu, hd.PhuongThuc, hd.TenNhanVienThu
FROM dbo.KB_HoaDon hd WITH (NOLOCK)
LEFT JOIN dbo.BenhNhan bn WITH (NOLOCK) ON hd.BenhNhan_Id = bn.BENHNHAN_ID
WHERE hd.TrangThai = N'DaThu' AND CONVERT(date, hd.NgayThu) = CONVERT(date, GETDATE())
ORDER BY hd.NgayThu DESC;");

    public async Task<dynamic?> GetHoaDonByTiepNhanAsync(int tiepNhanId)
    {
        var hd = await _db.OneAsync(@"
SELECT TOP 1 hd.HoaDon_Id, hd.SoHoaDon, hd.TiepNhan_Id, hd.BenhNhan_Id,
       hd.NgayLap, hd.TongTienGoc, hd.MienGiam, hd.BHYT_ChiTra,
       hd.BenhNhan_PhaiThu, hd.TrangThai, hd.NgayThu, hd.PhuongThuc,
       hd.TenNhanVienThu
FROM dbo.KB_HoaDon hd WITH (NOLOCK)
WHERE hd.TiepNhan_Id = @T
ORDER BY hd.HoaDon_Id DESC;",
            new { T = tiepNhanId });
        if (hd == null) return null;
        var items = await _db.ListAsync(
            "SELECT * FROM dbo.KB_HoaDon_ChiTiet WITH (NOLOCK) WHERE HoaDon_Id = @Id ORDER BY ChiTiet_Id",
            new { Id = ((IDictionary<string, object>)hd)["HoaDon_Id"] });
        var dict = (IDictionary<string, object>)hd;
        dict["Items"] = items.ToList();
        dict["DaCoHoaDon"] = true;
        return dict;
    }

    public async Task<int> LapHoaDonAsync(LapHoaDonReq req, int userId, string? userName)
    {
        if (req.TiepNhan_Id <= 0 || req.BenhNhan_Id <= 0)
            throw new ArgumentException("Thiếu TiepNhan_Id / BenhNhan_Id");

        // Chặn duplicate
        int existed = await _db.ScalarAsync<int?>(
            "SELECT TOP 1 HoaDon_Id FROM dbo.KB_HoaDon WHERE TiepNhan_Id = @T",
            new { T = req.TiepNhan_Id }) ?? 0;
        if (existed > 0) return existed;

        var draft = await GetHoaDonDraftAsync(req.TiepNhan_Id);
        if (draft == null) throw new InvalidOperationException("Không có phí để lập hóa đơn");

        // draft là anonymous type (HĐ chưa lập) → KHÔNG cast IDictionary được; đọc qua JSON.
        // Ép (object?) để SerializeToElement không dispatch dynamic (giữ kiểu JsonElement).
        System.Text.Json.JsonElement draftEl =
            System.Text.Json.JsonSerializer.SerializeToElement((object?)draft);
        decimal tongGoc = draftEl.TryGetProperty("TongTienGoc", out var tgEl) ? tgEl.GetDecimal() : 0;
        decimal mienGiam = req.MienGiam ?? 0;
        decimal bhyt = req.BHYT_ChiTra ?? 0;
        decimal phaiThu = Math.Max(0, tongGoc - mienGiam - bhyt);

        var now = DateTime.Now;
        string soHd = "HD" + now.ToString("yyMMdd");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        // Sinh số HD: prefix + seq
        int seq = await _db.ScalarAsync<int?>(@"
SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(SoHoaDon, LEN(@Pre)+1, 4) AS int)),0) + 1
FROM dbo.KB_HoaDon WHERE SoHoaDon LIKE @Pre + '%';",
            new { Pre = soHd }) ?? 1;
        soHd += seq.ToString("D4");

        int hdId = await _db.ScalarAsync<int>(@"
INSERT INTO dbo.KB_HoaDon
    (SoHoaDon, TiepNhan_Id, BenhNhan_Id, NgayLap,
     TongTienGoc, MienGiam, BHYT_ChiTra, BenhNhan_PhaiThu,
     TrangThai, GhiChu)
VALUES
    (@So, @T, @B, @Now, @TG, @MG, @BH, @PT, N'ChuaThu', @GC);
SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new
            {
                So = soHd,
                T = req.TiepNhan_Id,
                B = req.BenhNhan_Id,
                Now = now,
                TG = tongGoc,
                MG = mienGiam,
                BH = bhyt,
                PT = phaiThu,
                GC = req.GhiChu,
            });

        if (draftEl.TryGetProperty("Items", out var itemsEl)
            && itemsEl.ValueKind == System.Text.Json.JsonValueKind.Array)
        {
            foreach (var it in itemsEl.EnumerateArray())
            {
                int? refId = it.TryGetProperty("RefId", out var refEl)
                    && refEl.ValueKind != System.Text.Json.JsonValueKind.Null
                        ? refEl.GetInt32() : (int?)null;
                await _db.ExecuteAsync(@"
INSERT INTO dbo.KB_HoaDon_ChiTiet
    (HoaDon_Id, Loai, RefId, TenDichVu, SoLuong, DonGia, ThanhTien)
VALUES
    (@HD, @Loai, @Ref, @Ten, @SL, @DG, @TT);",
                    new
                    {
                        HD = hdId,
                        Loai = it.GetProperty("Loai").GetString(),
                        Ref = refId,
                        Ten = it.GetProperty("TenDichVu").GetString(),
                        SL = it.GetProperty("SoLuong").GetDecimal(),
                        DG = it.GetProperty("DonGia").GetDecimal(),
                        TT = it.GetProperty("ThanhTien").GetDecimal(),
                    });
            }
        }

        scope.Complete();
        return hdId;
    }

    public async Task<bool> ThuTienAsync(ThuTienReq req, int userId, string? userName)
    {
        if (req.HoaDon_Id <= 0) throw new ArgumentException("Thiếu HoaDon_Id");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        var now = DateTime.Now;
        int rows = await _db.ExecuteAsync(@"
UPDATE dbo.KB_HoaDon
SET TrangThai = N'DaThu', NgayThu = @Now,
    NhanVienThu_Id = @UID, TenNhanVienThu = @UName,
    PhuongThuc = @PT
WHERE HoaDon_Id = @Id AND TrangThai = N'ChuaThu';",
            new
            {
                Now = now,
                UID = userId,
                UName = userName ?? "",
                PT = req.PhuongThuc ?? "TienMat",
                Id = req.HoaDon_Id,
            });

        if (req.HangDoiPhongBan_Id is int hdpb && hdpb > 0)
        {
            await _db.ExecuteAsync(@"
UPDATE dbo.HangDoiPhongBan
SET TinhTrang = 2, NgayGioHoanTat = @Now,
    NoiDungDaThucHien = ISNULL(NoiDungDaThucHien, N'') + N' [Đã thu tiền]'
WHERE HangDoiPhongBan_Id = @Id;",
                new { Now = now, Id = hdpb });

            // TUẦN TỰ: thu tiền xong → nếu BN có ĐƠN THUỐC hôm nay → TỰ đẩy Nhà thuốc
            // (trả tiền TRƯỚC, lấy thuốc SAU). ChuyenSangNhaThuoc đã dedup + PB9.
            var bnId = await _db.ScalarAsync<int?>(
                "SELECT BenhNhan_Id FROM dbo.HangDoiPhongBan WHERE HangDoiPhongBan_Id = @Id",
                new { Id = hdpb });
            if (bnId.HasValue)
            {
                bool coThuoc = await _db.ScalarAsync<int>(@"
SELECT COUNT(*) FROM dbo.KB_DonThuoc WITH (NOLOCK)
WHERE BenhNhan_Id = @Bn AND CONVERT(date, NgayKe) = CONVERT(date, GETDATE())
  AND (TrangThai IS NULL OR TrangThai <> N'Huy')", new { Bn = bnId.Value }) > 0;
                if (coThuoc)
                    await _db.ExecuteAsync(
                        "exec SP_002_HangDoiPhongBan @Action = N'ChuyenSangNhaThuoc', @HangDoiPhongBan_Id = @Id, @NgayGioLaySo = @Now2",
                        new { Id = hdpb, Now2 = now.ToString("yyyyMMdd HH:mm:ss") });
            }
        }

        scope.Complete();
        return rows > 0;
    }

    // ════════════════════════════════════════════════════════════
    // Nhà thuốc — Phát thuốc
    // ════════════════════════════════════════════════════════════

    public Task<IEnumerable<dynamic>> GetDonThuocChoPhatAsync(int benhNhanId)
        => _db.ListAsync(@"
SELECT dt.DonThuoc_Id, dt.BenhNhan_Id, dt.TiepNhan_Id, dt.NgayKe,
       dt.TrangThai, dt.TongTien, dt.TenBacSi,
       (SELECT COUNT(*) FROM dbo.KB_DonThuoc_ChiTiet ct
          WHERE ct.DonThuoc_Id = dt.DonThuoc_Id) AS SoMucThuoc
FROM dbo.KB_DonThuoc dt WITH (NOLOCK)
WHERE dt.BenhNhan_Id = @BN AND dt.TrangThai = N'ChoPhat'
ORDER BY dt.NgayKe DESC;",
            new { BN = benhNhanId });

    public async Task<bool> PhatThuocAsync(PhatThuocReq req, int userId, string? userName)
    {
        if (req.DonThuoc_Id <= 0) throw new ArgumentException("Thiếu DonThuoc_Id");

        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        var now = DateTime.Now;
        int rows = await _db.ExecuteAsync(@"
UPDATE dbo.KB_DonThuoc
SET TrangThai = N'DaPhat', NgayPhat = @Now,
    NhanVienPhat_Id = @UID, TenNhanVienPhat = @UName,
    GhiChu = ISNULL(GhiChu, '') + ISNULL(N' | ' + @GC, '')
WHERE DonThuoc_Id = @Id AND TrangThai = N'ChoPhat';",
            new
            {
                Now = now,
                UID = userId,
                UName = userName ?? "",
                GC = req.GhiChu,
                Id = req.DonThuoc_Id,
            });

        if (req.HangDoiPhongBan_Id is int hdpb && hdpb > 0)
        {
            await _db.ExecuteAsync(@"
UPDATE dbo.HangDoiPhongBan
SET TinhTrang = 2, NgayGioHoanTat = @Now,
    NoiDungDaThucHien = ISNULL(NoiDungDaThucHien, N'') + N' [Đã phát thuốc]'
WHERE HangDoiPhongBan_Id = @Id;",
                new { Now = now, Id = hdpb });
        }

        scope.Complete();
        return rows > 0;
    }
}
