using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Qms.Services.Implementations;

public class CommonService : ICommonService
{
    private readonly IDatabaseHelper _db;

    public CommonService(IDatabaseHelper db)
    {
        _db = db;
    }

    public async Task<object?> NoiDungGioiThieuAsync()
    {
        string sql = "exec SP_K_002_HangDoiTiepNhan @Action = N'NoiDungGioiThieu'";
        var rows = await _db.ListAsync(sql);
        return rows.FirstOrDefault();
    }

    public Task<IEnumerable<dynamic>> CBBHangDoiAsync(int userId)
    {
        string sql = "exec SP_002_HangDoiPhongBan @Action = N'CBBHangDoi', @User_Id = @UserId";
        return _db.ListAsync(sql, new { UserId = userId });
    }
}
