using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface ICommonService
{
    Task<object?> NoiDungGioiThieuAsync();
    Task<IEnumerable<dynamic>> CBBHangDoiAsync(int userId);
}
