using Qms.Core.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Qms.Services.Interfaces;

public interface IHangDoiPhongBanService
{
    // SP_002_HangDoiPhongBan
    Task<IEnumerable<dynamic>> GetQueueListAsync(int userId);
    Task<IEnumerable<dynamic>> GetLoaiUuTienAsync();
    Task<IEnumerable<dynamic>> DeleteBnCheckInAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> BoQuaBnCheckInAsync(int hangDoiPhongBanId, UpdateBNRequest req);
    Task<IEnumerable<dynamic>> CBBHangDoiAsync(int userId);
    Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadAsync(int phongBanId);
    Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadByHangDoiAsync(int hangDoiId, int phongBanId);
    Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadTachAsync(int phongBanId);
    Task<IEnumerable<dynamic>> CheckBenhNhanDaGoiAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> CheckSTTDangChonTheoHangDoi_IdAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> STTTiepTheoCheckPhongBanAsync(int hangDoiId, int phongBanId);
    Task<IEnumerable<dynamic>> SelectDanhSachHangDoiTheoHangDoiIDAsync(int hangDoiId);
    Task<IEnumerable<dynamic>> SelectDanhSachHangDoiTheoHangDoiIDNewAsync(int hangDoiId);
    Task<IEnumerable<dynamic>> LoadHangDoiPhongBanchuaGoiAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> CapNhatSTTHangDoiAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> HoanTatBenhNhanCLSAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> HoanTatBenhNhanTruocAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> GoiBenhNhanCLSAsync(int hangDoiPhongBanId, int phongBanId);
    Task<IEnumerable<dynamic>> CheckSoPhieuYeuCauNhanBenhvaInSTTAsync(string soPhieu, int hangDoiId);
    Task<IEnumerable<dynamic>> SelectDanhSachHangDoiPhongBanIDDaThucHienAsync(int hangDoiId, int phongBanId);
    Task<IEnumerable<dynamic>> SelectDaGoiTrongNgayAsync(int hangDoiId, int phongBanId); // VP/NT: giữ BN đã hoàn tất
    Task<IEnumerable<dynamic>> ChayChuDanhSachChoAsync(int hangDoiId);
    Task<IEnumerable<dynamic>> ChayChuDanhSachChoNewAsync(int hangDoiId);
    Task<IEnumerable<dynamic>> ShowSTTChuaThucHienTop10Async(int hangDoiId);
    Task<IEnumerable<dynamic>> DanhSachBenhNhanAsync(int phongBanId = 0);
    Task<IEnumerable<dynamic>> DanhSachBenhNhanNoiTruAsync();
    Task<IEnumerable<dynamic>> CheckBenhNhanCoCLSNoiTruAsync(string maYTe);
    Task<IEnumerable<dynamic>> BenhNhanCheckInCLSNoiTruAsync(string maYTe);
    Task<IEnumerable<dynamic>> GoiBenhNhanAsync(int hangDoiPhongBanId, int phongBanId);
    Task<IEnumerable<dynamic>> ChuyenSangNhaThuocAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> ChuyenSangVienPhiAsync(int hangDoiPhongBanId);
    // Thu xong viện phí → đóng lượt VP + tự đẩy Nhà thuốc nếu có đơn thuốc.
    Task<IEnumerable<dynamic>> HoanTatThuTienAsync(int hangDoiPhongBanId);
    // Resolve TiepNhan_Id + BenhNhan_Id từ 1 lượt hàng đợi (mở hoá đơn cho BN đang gọi).
    Task<IEnumerable<dynamic>> GetThanhToanInfoAsync(int hangDoiPhongBanId);
    Task<int> HoanTatLuotKhamAsync(int hangDoiPhongBanId);
    Task<IEnumerable<dynamic>> CheckSoPhieuYeuCauNhanBenhVienPhiAsync(string soPhieuYeuCau);
    Task<IEnumerable<dynamic>> STTTiepTheoCheckPhongBanNewAsync(int hangDoiId, int phongBanId);
    Task<IEnumerable<dynamic>> ShowSTTDaThucHienLoadXetNghiemAsync(int phongBanId);

    // VienPhi
    Task<IEnumerable<dynamic>> ThemBnCheckInVPAsync(ThemBnCheckInVpReq req);
    Task<IEnumerable<dynamic>> ThemBnCheckInAsync(ThemBnCheckInRequest req);
    // Gắn BenhNhan_Id vào lượt "lấy số nhanh" khi quầy đã nhận dạng được BN.
    Task<int> LinkBenhNhanAsync(int hangDoiPhongBanId, int benhNhanId);

    // CLS
    Task<IEnumerable<dynamic>> ThemBnCheckInCLSAsync(ThemBnCheckInClsReq req);
    Task<IEnumerable<dynamic>> UpdateBnCheckInCLSAsync(UpdateNhanBenhCLSRequest req);

    // Custom SQL
    Task<IEnumerable<dynamic>> CBBPhongBanAsync(int userId);

    // Composed logic
    Task<IEnumerable<dynamic>> ProcessMoiBNAsync(int hangDoiId, int phongBanId);
    Task<IEnumerable<dynamic>> ProcessBoQuaBNAsync(int hangDoiPhongBanId, int phongBanId);
    Task<IEnumerable<dynamic>> ProcessMoiBNCLSAsync(int hangDoiId, int phongBanId, int hangDoiPhongBanId);
    Task<object> ProcessGoiBenhNhanDaChonCLSAsync(int hangDoiPhongBanId, int phongBanId);
    Task<object> ProcessGoiLaiBNAsync(int hangDoiPhongBanId, int phongBanId);
}
