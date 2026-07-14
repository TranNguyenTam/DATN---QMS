using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class TiepNhanTuDongService : ITiepNhanTuDongService
{
    private readonly IDatabaseHelper _db;

    public TiepNhanTuDongService(IDatabaseHelper db)
    {
        _db = db;
    }

    private static string Now() => System.DateTime.Now.ToString("yyyyMMdd HH:mm:ss");
    private static string Today() => System.DateTime.Now.ToString("yyyyMMdd");
    private static string BuoiTrongNgay() => System.DateTime.Now.Hour <= 11 ? "Sang" : "Chieu";

    public Task<IEnumerable<dynamic>> TuDongTiepNhanAsync(int userId, TuDongTiepNhanReq req)
    {
        const string sql = """
            EXEC sp_K_004_TiepNhanTuDong_VP
                @BenhNhan_Id = @BenhNhanId,
                @UuTien = @UuTien,
                @PhongBan_Id = 8,
                @PhongKham_Id = NULL,
                @DichVu_Id = @DichVuId,
                @User_id = @UserId,
                @ThuTienSau = @ThuTienSau,
                @ThoiGianTiepNhan = @ThoiGian,
                @NgayThucHien = @Ngay,
                @Buoi = @Buoi,
                @LoaiUuTien = @LoaiUuTien
            """;
        return _db.ListAsync(sql, new
        {
            BenhNhanId = req.BenhNhanId,
            UuTien = req.UuTien,
            DichVuId = req.DichVuId,
            UserId = userId,
            ThuTienSau = req.ThuTienSau,
            ThoiGian = Now(),
            Ngay = Today(),
            Buoi = BuoiTrongNgay(),
            LoaiUuTien = req.LoaiUuTienText
        });
    }

    public async Task<IEnumerable<dynamic>> ProcessTuDongTiepNhanAsync(int userId, TuDongTiepNhanReq req)
    {
        var rows = System.Linq.Enumerable.ToList(await TuDongTiepNhanAsync(userId, req));
        if (rows.Count > 0)
        {
            var d = (System.Collections.Generic.IDictionary<string, object>)rows[0];
            int id = System.Convert.ToInt32(d["HangDoiPhongBan_Id"]);
            return await GetSoThuTuAsync(id);
        }
        return System.Array.Empty<dynamic>();
    }

    public Task<IEnumerable<dynamic>> GetSoThuTuAsync(int hangDoiPhongBanId)
        => _db.ListAsync("exec sp_CNTT_001_SoThuTuTiepNhan_TheoHangDoiPhongBan_id @HangDoiPhongBan_id = @Id",
            new { Id = hangDoiPhongBanId });
}
