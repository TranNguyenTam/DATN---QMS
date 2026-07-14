import { Tag } from "antd";

/**
 * StatusTag — Tag trạng thái thống nhất toàn hệ (Design System).
 * Gom mọi <Tag color="..."> rải rác về 1 bản đồ ngữ nghĩa → cùng trạng thái = cùng màu.
 * Dùng: <StatusTag status="Đang chờ" /> hoặc <StatusTag status="x" color="blue">Nhãn</StatusTag>
 */
const STATUS_COLOR = {
  // Hàng đợi
  "Đang chờ": "orange",
  "Đã gọi": "processing",
  "Đang gọi": "processing",
  "Đã Tiếp Nhận": "processing",
  "Hoàn tất": "success",
  "Đã khám": "success",
  "Đã qua lượt": "error",
  // Danh mục / hoạt động
  "Đang Hoạt Động": "success",
  "Tạm ngưng": "default",
  "Tạm Ngưng": "default",
  // Thu phí
  "Thu trước": "green",
  "Thu sau": "orange",
  // CLS / kết quả
  "Có KQ": "success",
  "Chờ KQ": "orange",
  // Ưu tiên
  "Ưu tiên": "red",
};

export default function StatusTag({ status, color, children }) {
  const resolved = color || STATUS_COLOR[status] || "default";
  const label = children ?? status ?? "—";
  return <Tag color={resolved}>{label}</Tag>;
}
