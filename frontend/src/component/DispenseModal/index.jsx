import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, List, Modal, Tag, message } from "antd";
import http from "../../util/httpClient";

/**
 * Modal Nhà thuốc — list đơn thuốc chờ phát, click "Đã phát" cho mỗi đơn.
 * Props: open, onClose, patient (HangDoiPhongBan row), onSuccess()
 */
export default function DispenseModal({ open, onClose, patient, onSuccess }) {
  const [dons, setDons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [details, setDetails] = useState({});  // donThuocId → list ChiTiet

  const fetchDons = async () => {
    if (!patient?.BenhNhan_Id) return;
    setLoading(true);
    try {
      const res = await http.get(`/nha-thuoc/don/${patient.BenhNhan_Id}`);
      setDons(res?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchDons();
  }, [open, patient?.BenhNhan_Id]);

  const loadDetail = async (donThuocId) => {
    if (details[donThuocId]) return;
    // Detail từ /benh-an/{baId}? Ở Phase 3 BE chưa có endpoint lấy chi tiết đơn riêng.
    // Workaround: hiển thị card-level thông tin từ list (chưa có item-level).
    // TODO Phase 4: thêm endpoint /nha-thuoc/don-detail/{id}
    setDetails((d) => ({ ...d, [donThuocId]: [] }));
  };

  const handleDaPhat = async (don) => {
    setProcessing(don.DonThuoc_Id);
    try {
      await http.post("/nha-thuoc/da-phat", {
        donThuoc_Id: don.DonThuoc_Id,
        hangDoiPhongBan_Id: patient?.HangDoiPhongBan_Id,
      });
      message.success(`Đã phát đơn #${don.DonThuoc_Id}`);
      onSuccess?.();
      onClose();
    } catch (e) {
      message.error(e?.message || "Lỗi cập nhật");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={620}
      title={`💊 Đơn thuốc của ${patient?.TenBenhNhan || "BN"}`}
      footer={[
        <Button key="c" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      destroyOnClose
    >
      {!patient?.BenhNhan_Id ? (
        <Alert showIcon type="warning" message="Chưa gọi BN" />
      ) : dons.length === 0 ? (
        <Empty description={loading ? "Đang tải..." : "Không có đơn nào chờ phát"} />
      ) : (
        <List
          dataSource={dons}
          renderItem={(don) => (
            <List.Item style={{ padding: 0, marginBottom: 12, display: "block" }}>
              <Card
                size="small"
                title={
                  <span>
                    Đơn <b>#{don.DonThuoc_Id}</b>{" "}
                    <Tag color="orange">{don.TrangThai}</Tag>
                    <span style={{ color: "#64748b", fontWeight: 400, fontSize: 12 }}>
                      · {don.SoMucThuoc} mục thuốc
                    </span>
                  </span>
                }
                extra={
                  <Button
                    type="primary"
                    loading={processing === don.DonThuoc_Id}
                    onClick={() => handleDaPhat(don)}
                  >
                    ✅ Đã phát
                  </Button>
                }
              >
                <p style={{ margin: 0 }}>
                  <b>Bác sĩ kê:</b> {don.TenBacSi || "—"} ·{" "}
                  <b>Ngày:</b>{" "}
                  {don.NgayKe ? new Date(don.NgayKe).toLocaleString("vi-VN") : "—"}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 16 }}>
                  <b>Tổng tiền: </b>
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>
                    {(don.TongTien || 0).toLocaleString("vi-VN")}đ
                  </span>
                </p>
              </Card>
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
}
