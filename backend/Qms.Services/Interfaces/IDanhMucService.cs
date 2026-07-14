using Qms.Core.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface IDanhMucService
{
    // Phong Ban
    Task<IEnumerable<dynamic>> SelectDanhMucPhongBanAsync();
    Task<IEnumerable<dynamic>> CBBLoaiPhongBanAsync();
    Task<IEnumerable<dynamic>> SelectDanhMucPhongBanTheoIDAsync(int phongBanId);
    Task<IEnumerable<dynamic>> InsertDanhMucPhongBanAsync(int userId, UpdatePhongBanReq req);
    Task<IEnumerable<dynamic>> UpdateDanhMucPhongBanAsync(int userId, UpdatePhongBanReq req);
    Task<IEnumerable<dynamic>> DeleteDanhMucPhongBanAsync(int userId, int id);

    // Hang Doi
    Task<IEnumerable<dynamic>> SelectDanhMucHangDoiAsync();
    Task<IEnumerable<dynamic>> SelectDanhMucHangDoiTheoIDAsync(int hangDoiId);
    Task<IEnumerable<dynamic>> InsertDanhMucHangDoiAsync(int userId, UpdateHangDoiReq req);
    Task<IEnumerable<dynamic>> UpdateDanhMucHangDoiAsync(int userId, UpdateHangDoiReq req);
    Task<IEnumerable<dynamic>> DeleteDanhMucHangDoiAsync(int userId, int id);
}
