using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface ITiepNhanTuDongService
{
    Task<IEnumerable<dynamic>> TuDongTiepNhanAsync(int userId, TuDongTiepNhanReq req);
    Task<IEnumerable<dynamic>> ProcessTuDongTiepNhanAsync(int userId, TuDongTiepNhanReq req);
    Task<IEnumerable<dynamic>> GetSoThuTuAsync(int hangDoiPhongBanId);
}
