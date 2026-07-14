export const EVENT_SOCKET = {
  GOI_BN: "GOI_BN",
  BO_QUA: "BO_QUA",
  NHAN_BN: "NHAN_BN",
  XOA_BN: "XOA_BN",
  GOI_LAI: "GOI_LAI",
};

const EVENTS_NEED_REFRESH = new Set([
  EVENT_SOCKET.GOI_BN,
  EVENT_SOCKET.GOI_LAI,
  EVENT_SOCKET.BO_QUA,
  EVENT_SOCKET.NHAN_BN,
  EVENT_SOCKET.XOA_BN,
]);

const EVENTS_NEED_VOICE = new Set([EVENT_SOCKET.GOI_BN, EVENT_SOCKET.GOI_LAI]);

export { EVENTS_NEED_REFRESH, EVENTS_NEED_VOICE };

/**
 * Map mỗi module thao tác → các HangDoi_Id mặc định của module đó.
 * Tham chiếu bảng DM_HangDoi hiện có trong DB:
 *   1  Tiếp Nhận      2  Ưu Tiên      3  Khu Khám Bệnh
 *   4  Thu Viện Phí   5  Nhà Thuốc    6  Lấy mẫu Xét Nghiệm
 *   7  Siêu Âm        8  XQuang       9  Đo loãng xương    10 CT
 *  11  Tiếp nhận căn cước
 *
 * Hook dùng để tự filter danh sách hàng đợi/phòng ban user được gán theo
 * trang đang mở — UI tự khóa theo đúng nghiệp vụ của module.
 */
export const MODULE_HANG_DOI = {
  tiepNhan: [1, 2, 11],
  khamBenh: [3],
  vienPhi: [4],
  nhaThuoc: [5],
  cls: [6],
  cdha: [7, 8, 9, 10],
};

/**
 * Map module → PhongBan_Id được phép chọn ở trang đó.
 * Khớp với DB QMS_DA (xem DM_PhongBan):
 *   1=Quầy TN, 2=PK1, 3=PK2, 4=PK3, 5=LấyMẫuXN, 6=SiêuÂm1, 7=XQuang,
 *   8=ThuViệnPhí, 9=NhàThuốc, 10=SiêuÂm2, 11=ĐoLoãngXương, 12=CT,
 *   14=PhòngKhámYêuCầu, 15=KhoaNgoạiPhụ
 *
 * Lý do tồn tại: ADMIN bypass ở backend trả về TẤT CẢ phòng cho user
 * ADMIN, gây dropdown lộn xộn (vd Viện phí thấy cả Phòng Khám 1).
 * FE filter để khoá theo nghiệp vụ module.
 */
export const MODULE_PHONG_BAN = {
  tiepNhan: [1],                // Quầy Tiếp Nhận
  khamBenh: [2, 3, 4, 14, 15],  // Phòng Khám 1-3 + KYC + KNP
  vienPhi: [8],                 // Phòng Thu Viện Phí
  nhaThuoc: [9],                // Nhà Thuốc Bệnh Viện
  cls: [5],                     // Phòng Lấy Mẫu Xét Nghiệm
  cdha: [6, 7, 10, 11, 12],     // SiêuÂm1, XQuang, SiêuÂm2, ĐoLoãngXương, CT
};

/**
 * Map PhongBan_Id → các HangDoi_Id mà phòng đó được phép gọi.
 * Mục đích: ràng buộc dropdown hàng đợi theo PHÒNG đang chọn để chống
 * "đứng ở phòng này gọi hàng đợi của phòng khác" (vd Phòng Siêu Âm 2 gọi
 * hàng đợi CT). Chỉ áp cho module có nhiều phòng × nhiều hàng đợi (CDHA);
 * các module 1 hàng đợi không bị ảnh hưởng.
 *
 * Phòng KHÔNG có trong map ⇒ không siết (giữ toàn bộ hàng đợi của module).
 */
export const PHONG_BAN_HANG_DOI = {
  // CLS
  5: [6],   // Phòng Lấy Mẫu XN → Lấy mẫu Xét Nghiệm
  // CDHA — mỗi phòng chỉ gọi đúng hàng đợi của mình
  6: [7],   // Phòng Siêu Âm 1  → Siêu âm
  10: [7],  // Phòng Siêu Âm 2  → Siêu âm
  7: [8],   // Phòng X Quang    → XQuang
  11: [9],  // Phòng Đo Loãng Xương → Đo loãng xương
  12: [10], // Phòng CT         → CT
};
