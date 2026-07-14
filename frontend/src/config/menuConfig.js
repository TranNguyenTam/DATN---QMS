import { lazy } from "react";

// Tiếp nhận
import GoiBenhCDHA from "../pages/cdha/GoiBenhCDHA";
import TiviCDHA from "../pages/cdha/TiviCDHA";
import HangDoiLayMau from "../pages/cls/HangDoiLayMau";
import TiviKhamBenh from "../pages/khamBenh/TiviKhamBenh";
import KioskTiepNhan from "../pages/tiepNhan/KioskTiepNhan";
import QuayTiepNhan from "../pages/tiepNhan/QuayTiepNhan";
const TiviTiepNhan = lazy(() => import("../pages/tiepNhan/TiviTiepNhan"));
const DangKyDayDu = lazy(() => import("../pages/tiepNhan/DangKyDayDu"));

// Khám bệnh
const QuanLyKhamBenh = lazy(() => import("../pages/khamBenh/QuanLyKhamBenh"));
const DanhSachKhamBenh = lazy(
  () => import("../pages/khamBenh/DanhSachKhamBenh"),
);
const BenhAnChiDinh = lazy(() => import("../pages/khamBenh/BenhAnChiDinh"));
const LichSuKhamBenh = lazy(() => import("../pages/khamBenh/LichSuKhamBenh"));

// Cận lâm sàng
const TiviHangDoiLayMau = lazy(() => import("../pages/cls/TiviHangDoiLayMau"));
const CLSCheckInNoiTru = lazy(() => import("../pages/cls/CLSCheckInNoiTru"));

// Chẩn đoán hình ảnh
const NhapBenhCDHA = lazy(() => import("../pages/cdha/NhapBenhCDHA"));
const TiviCDHATongHop = lazy(() => import("../pages/cdha/TiviCDHATongHop"));

// Danh mục
const PhongBan = lazy(() => import("../pages/danhMuc/PhongBan"));
const HangDoi = lazy(() => import("../pages/danhMuc/HangDoi"));
const PhanQuyen = lazy(() => import("../pages/danhMuc/PhanQuyen"));
const NoiDungDacBiet = lazy(() => import("../pages/danhMuc/NoiDungDacBiet"));
const ThoiGianThucHienDV = lazy(
  () => import("../pages/danhMuc/ThoiGianThucHienDV"),
);

// Hệ thống
const NguoiDung = lazy(() => import("../pages/heThong/NguoiDung"));
const Menu = lazy(() => import("../pages/heThong/Menu"));
const PhanQuyenMenu = lazy(() => import("../pages/heThong/PhanQuyenMenu"));
const ServerConfig = lazy(() => import("../pages/heThong/ServerConfig"));
const SoundConfig = lazy(() => import("../pages/heThong/SoundConfig"));
const DanhSachBenhNhan = lazy(
  () => import("../pages/heThong/DanhSachBenhNhan"),
);
const ChangePassword = lazy(() => import("../pages/heThong/ChangePassword"));
const QuanLyQuyen = lazy(() => import("../pages/heThong/QuanLyQuyen"));
const FaceEnrollment = lazy(() => import("../pages/heThong/FaceEnrollment"));
const FaceAuditLog = lazy(() => import("../pages/heThong/FaceAuditLog"));

// Dashboard
const DashboardKPI = lazy(() => import("../pages/dashboard/DashboardKPI"));
const WaitTimeMetrics = lazy(() => import("../pages/dashboard/WaitTimeMetrics"));
const PhanTichVanHanh = lazy(() => import("../pages/dashboard/PhanTichVanHanh"));
// BaoCaoDoanhThu — bỏ khỏi menu vì scope đồ án tập trung QMS (queue),
// không bao gồm HIS billing. File pages/dashboard/BaoCaoDoanhThu.jsx
// giữ lại để dùng khi mở rộng sang HIS thật.

// Viện phí
import VienPhiGoiBenh from "../pages/vienphi/VienPhiGoiBenh";
import ThanhToanVienPhi from "../pages/vienphi/ThanhToanVienPhi";
import VienPhiTivi from "../pages/vienphi/VienPhiTivi";

// Nhà thuốc
const NhaThuocGoiBenh = lazy(() => import("../pages/nhathuoc/NhaThuocGoiBenh"));
const NhaThuocTivi = lazy(() => import("../pages/nhathuoc/NhaThuocTivi"));

export const ALL_MENU_ITEMS = [
  {
    key: "ribbonPageDashboard",
    label: "Dashboard",
    icon: "DashboardOutlined",
    children: [
      {
        key: "barButtonDashboardKpi",
        label: "KPI vận hành",
        path: "/dashboard/kpi",
        component: DashboardKPI,
      },
      {
        key: "barButtonPhanTichVanHanh",
        label: "Phân tích vận hành",
        path: "/dashboard/phan-tich",
        component: PhanTichVanHanh,
      },
      {
        key: "barButtonWaitTimeMetrics",
        label: "Đo lường dự báo",
        path: "/dashboard/wait-time-metrics",
        component: WaitTimeMetrics,
      },
    ],
  },

  {
    key: "ribbonPage1",
    label: "Tiếp Nhận",
    icon: "UserAddOutlined",
    children: [
      {
        key: "ribbonPageGroup3",
        label: "Tiếp nhận",
        children: [
          {
            key: "barButtonItem2",
            label: "Quầy tiếp nhận",
            path: "/tiep-nhan/quay",
            component: QuayTiepNhan,
          },
          {
            key: "barButtonItemDangKyDayDu",
            label: "Đăng ký đầy đủ",
            path: "/tiep-nhan/dang-ky-day-du",
            component: DangKyDayDu,
          },
        ],
      },
      {
        key: "ribbonPageGroupHoSoBN",
        label: "Hồ sơ bệnh nhân",
        children: [
          // Chuyển từ "Hệ thống" sang đây — quản lý hồ sơ BN + onboarding khuôn
          // mặt là nghiệp vụ tiếp nhận, không phải quản trị hệ thống. Giữ nguyên
          // key + path → RBAC & route không đổi.
          {
            key: "barButtonItem36",
            label: "Quản lý bệnh nhân",
            path: "/system/danh-sach-benh-nhan",
            component: DanhSachBenhNhan,
          },
          {
            key: "barButtonItem37",
            label: "Đăng ký khuôn mặt",
            path: "/system/face-enrollment",
            component: FaceEnrollment,
          },
        ],
      },
      {
        key: "ribbonPageGroup1",
        label: "Kiosk",
        children: [
          {
            key: "barButtonItem1",
            label: "Kiosk tiếp nhận",
            path: "/kiosk/tiep-nhan",
            component: KioskTiepNhan,
          },
          {
            key: "barButtonItem3",
            label: "Tivi tiếp nhận",
            path: "/tivi/tiep-nhan",
            component: TiviTiepNhan,
          },
        ],
      },
    ],
  },

  {
    key: "ribbonPage2",
    label: "Khám bệnh",
    icon: "UserOutlined",
    children: [
      {
        key: "ribbonPageGroup2",
        label: "Khám bệnh",
        children: [
          {
            key: "barButtonItem4",
            label: "Quản lý hàng đợi",
            path: "/kham-benh/quan-ly",
            component: QuanLyKhamBenh,
          },
          {
            key: "barButtonBenhAnChiDinh",
            label: "Bệnh án + Chỉ định",
            path: "/kham-benh/benh-an",
            component: BenhAnChiDinh,
          },
          {
            key: "barButtonLichSuKhamBenh",
            label: "Lịch sử khám bệnh",
            path: "/kham-benh/lich-su",
            component: LichSuKhamBenh,
          },
          {
            key: "barButtonItem5",
            label: "Tivi Khám bệnh",
            path: "/tivi/kham-benh",
            component: TiviKhamBenh,
          },
          // GỠ "Danh sách khám bệnh" — 100% trùng "Bệnh án + Chỉ định"
          // (cùng endpoint /kham-benh/danh-sach-benh-nhan) nhưng chỉ render
          // bảng cột thô (auto-gen), không có nút hành động → vô dụng.
          // File DanhSachKhamBenh.jsx giữ trong repo.
          // { key: "barButtonItem28", label: "Danh sách khám bệnh", path: "/kham-benh/danh-sach", component: DanhSachKhamBenh },
        ],
      },
    ],
  },

  {
    key: "ribbonPage3",
    label: "Cận lâm sàng",
    icon: "ExperimentOutlined",
    children: [
      {
        key: "ribbonPageGroup4",
        label: "Xét nghiệm",
        children: [
          {
            key: "barButtonItem6",
            label: "Quản lý hàng đợi lấy mẫu",
            path: "/cls/hang-doi",
            component: HangDoiLayMau,
          },
          {
            key: "barButtonItem7",
            label: "Tivi hàng đợi lấy mẫu",
            path: "/tivi/lay-mau",
            component: TiviHangDoiLayMau,
          },
        ],
      },
      // GỠ nhóm "Bệnh nhân nội trú" — QMS_DA standalone chỉ hỗ trợ ngoại
      // trú (mọi tiếp nhận LoaiPhieu='NgoaiTru'), danh sách nội trú luôn
      // trống. Cần kết nối HIS thật mới dùng được. File CLSCheckInNoiTru
      // giữ trong repo.
      // { key: "ribbonPageGroup12", label: "Bệnh nhân nội trú", children: [
      //   { key: "barButtonItem27", label: "Check-in CLS nội trú", path: "/cls/noi-tru/check-in", component: CLSCheckInNoiTru } ] },
      {
        key: "ribbonPageGroup5",
        label: "Chẩn đoán hình ảnh",
        children: [
          // GỠ trang "Nhận bệnh" riêng — trang "Gọi bệnh" (GoiBenhCDHA) ĐÃ có
          // sẵn ô quét phiếu (ScanInput → handleInsertVP → /cls/check-barcode
          // → /cls/insert) + lọc hàng đợi đúng (MODULE_HANG_DOI.cdha) + gọi/
          // bỏ qua/gọi lại. KTV chỉ cần 1 trang này để VỪA quét nhận VỪA gọi.
          // Trang NhapBenhCDHA cũ lọc hàng đợi sai (rơi về Tiếp Nhận) + trùng.
          // { key: "barButtonItem8", label: "Nhận bệnh (quét phiếu)", path: "/cdha/nhan-benh", component: NhapBenhCDHA },
          {
            key: "barButtonItem9",
            label: "Nhận & Gọi bệnh",
            path: "/cdha/goi-benh",
            component: GoiBenhCDHA,
          },
          {
            key: "barButtonItem10",
            label: "Tivi CDHA",
            path: "/tivi/cdha",
            component: TiviCDHA,
          },
          {
            key: "barButtonTiviCdhaTongHop",
            label: "Tivi CĐHA tổng hợp",
            path: "/tivi/cdha-tong-hop",
            component: TiviCDHATongHop,
          },
        ],
      },
    ],
  },

  {
    key: "ribbonPage6",
    label: "Viện phí",
    icon: "DollarOutlined",
    children: [
      {
        key: "ribbonPageGroup10",
        label: "Viện phí thao tác",
        children: [
          {
            key: "barButtonItem23",
            label: "Viện phí gọi bệnh",
            path: "/vien-phi/goi-benh",
            component: VienPhiGoiBenh,
          },
          {
            key: "barButtonItemVpThanhToan",
            label: "Thanh toán viện phí",
            path: "/vien-phi/thanh-toan",
            component: ThanhToanVienPhi,
            // Dùng chung quyền với "Viện phí gọi bệnh" để thu ngân thấy luôn.
            permissionKey: "barButtonItem23",
          },
          {
            key: "barButtonItem24",
            label: "Viện phí Tivi",
            path: "/tivi/vien-phi",
            component: VienPhiTivi,
          },
        ],
      },
    ],
  },

  {
    key: "ribbonPage7",
    label: "Nhà thuốc",
    icon: "ShopOutlined",
    children: [
      {
        key: "ribbonPageGroup11",
        label: "Nhà thuốc thao tác",
        children: [
          {
            key: "barButtonItem25",
            label: "Nhà thuốc gọi bệnh",
            path: "/nha-thuoc/goi-benh",
            component: NhaThuocGoiBenh,
          },
          {
            key: "barButtonItem26",
            label: "Nhà thuốc Tivi",
            path: "/tivi/nha-thuoc",
            component: NhaThuocTivi,
          },
        ],
      },
    ],
  },

  {
    key: "ribbonPage5",
    label: "Hệ thống",
    icon: "SettingOutlined",
    children: [
      {
        key: "barButtonItem31",
        label: "Quản lý người dùng",
        path: "/system/users",
        component: NguoiDung,
      },
      {
        key: "barButtonQuanLyQuyen",
        label: "Vai trò & Phân quyền menu",
        path: "/system/quan-ly-quyen",
        component: QuanLyQuyen,
      },
      {
        key: "barButtonPhanCongPhongHangDoi",
        label: "Phân công phòng/hàng đợi",
        path: "/system/phan-cong",
        component: PhanQuyen,
      },
      // GỠ khỏi menu (giữ file để rollback dễ):
      //   /system/menus              Sys_Menu CRUD — legacy không sync menuConfig.js
      //   /system/permission-menu    Phân quyền menu per-user — bị RBAC thay thế
      // Bỏ comment 2 dòng dưới nếu muốn hiện lại:
      // { key: "barButtonItem32", label: "Menu (legacy)", path: "/system/menus", component: Menu },
      // { key: "barButtonItem33", label: "Phân quyền menu (legacy)", path: "/system/permission-menu", component: PhanQuyenMenu },
      // GỠ khỏi menu — không có nghiệp vụ quản lý trên web:
      //   /system/server  Trang chỉ hiển thị status SignalR connection (read-only).
      //   /system/sound   Trang test Viettel TTS — dev tool, không phải nghiệp vụ.
      // File component giữ trong repo để rollback nhanh khi cần.
      {
        key: "barButtonItem38",
        label: "Audit log khuôn mặt",
        path: "/system/face-audit-log",
        component: FaceAuditLog,
      },
      {
        key: "barButtonItem30",
        label: "Đổi mật khẩu",
        path: "/system/doi-mat-khau",
        component: ChangePassword,
      },
    ],
  },

  {
    key: "ribbonPage4",
    label: "Danh mục",
    icon: "UnorderedListOutlined",
    children: [
      {
        key: "barButtonItem25_danhmuc",
        permissionKey: "barButtonItem25",
        label: "Danh mục phòng ban",
        path: "/danh-muc/phong-ban",
        component: PhongBan,
      },
      {
        key: "barButtonItem12",
        label: "Danh mục hàng đợi",
        path: "/danh-muc/hang-doi",
        component: HangDoi,
      },
      // GỠ "Phân quyền User - Hàng đợi" khỏi Danh mục — đã MOVE sang
      // "Hệ thống → Phân công phòng/hàng đợi" cho hợp lý (đây là gán
      // user, không phải danh mục dữ liệu). Component PhanQuyen vẫn
      // mount tại /system/phan-cong qua sub-menu Hệ thống mới.
      // GỠ khỏi menu — feature advanced, 0 row data:
      //   /danh-muc/noi-dung-dac-biet  Route BN theo nội dung đặc biệt
      //     (vd "Siêu âm tim" → ép PK Tim). UDF check_NoiDung +
      //     check_PhongBan_NoiDung đọc bảng này nhưng đang rỗng → mọi BN
      //     dùng route mặc định (load-balance). Không cần config tay.
      //   /danh-muc/thoi-gian-dv  Config phút/DV cho rule-based wait-time.
      //     Đã bị ML model thay (tự học EWMA từ HangDoiPhongBan lịch sử).
      // File component giữ trong repo để rollback khi cần.
    ],
  },
];
