using Qms.Core.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface IHangDoiTiepNhanService
{
    // SP_004_HangDoiTiepNhan
    Task<IEnumerable<dynamic>> CBBQuayAsync(int userId);
    Task<IEnumerable<dynamic>> CBBHangDoiAsync(int userId);
    Task<IEnumerable<dynamic>> HangDoi_detail_selectAsync(int hangDoiId);
    Task<IEnumerable<dynamic>> Select_MoiBNAsync(int hangDoiId, int quayId);
    Task<IEnumerable<dynamic>> Select_MoiBN_TenBenhNhanAsync(int hangDoiId, string stt);
    Task<IEnumerable<dynamic>> BaoCaoTongSoBNChuaTNAsync(int userId);
    Task<IEnumerable<dynamic>> update_MoiBNAsync(GoiTiepTheoRequest req);
    Task<IEnumerable<dynamic>> GetHangDoiHienThiTVTiepNhanAsync(int phongBanId);
    Task<IEnumerable<dynamic>> GetHangDoiHienThiTVTiepNhanNoRowAsync(int phongBanId);
    Task<IEnumerable<dynamic>> GetHangDoiTiepNhanDangChoAsync(int hangDoiId);

    // SP_K_002_HangDoiTiepNhan
    Task<IEnumerable<dynamic>> SelectDichVuKhamBenhAsync();
    Task<IEnumerable<dynamic>> CheckSoVaoVienVPAsync(string soVaoVien);
    Task<dynamic?> NoiDungGioiThieuAsync();
}
