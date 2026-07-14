import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, InputNumber, Modal, Radio, Space, Table, Tag, message } from "antd";
import http from "../../util/httpClient";

/**
 * Modal Viện phí — hiển thị draft hóa đơn → Lập + Thu tiền.
 * Props: open, onClose, patient (HangDoiPhongBan row), onSuccess()
 */
export default function InvoiceModal({ open, onClose, patient, onSuccess }) {
  const [data, setData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mienGiam, setMienGiam] = useState(0);
  const [bhyt, setBhyt] = useState(0);
  const [phuongThuc, setPhuongThuc] = useState("TienMat");

  const tiepNhanId = patient?.TIEPNHAN_ID || patient?.TiepNhan_Id;

  useEffect(() => {
    if (!open || !tiepNhanId) return;
    (async () => {
      try {
        const res = await http.get(`/vien-phi/hoa-don/${tiepNhanId}`);
        setData(res?.data || null);
        setMienGiam(0);
        setBhyt(0);
      } catch (e) {
        if (e?.status === 404) setData(null);
        else console.error(e);
      }
    })();
  }, [open, tiepNhanId]);

  const items = data?.Items || [];
  const tongGoc = data?.TongTienGoc || 0;
  const phaiThu = Math.max(0, tongGoc - (mienGiam || 0) - (bhyt || 0));
  const daCoHd = data?.DaCoHoaDon === true;
  const daThu = daCoHd && data?.TrangThai === "DaThu";

  const handleLapVaThu = async () => {
    if (!tiepNhanId || !patient?.BenhNhan_Id) {
      message.error("Thiếu thông tin BN");
      return;
    }
    setSubmitting(true);
    try {
      let hoaDonId = data?.HoaDon_Id;
      // 1. Lập hóa đơn nếu chưa
      if (!daCoHd) {
        const lapRes = await http.post("/vien-phi/lap-hoa-don", {
          tiepNhan_Id: tiepNhanId,
          benhNhan_Id: patient.BenhNhan_Id,
          mienGiam: mienGiam,
          bhyT_ChiTra: bhyt,
        });
        hoaDonId = lapRes?.data?.hoaDonId;
      }
      // 2. Thu tiền
      await http.post("/vien-phi/thu-tien", {
        hoaDon_Id: hoaDonId,
        phuongThuc: phuongThuc,
        hangDoiPhongBan_Id: patient.HangDoiPhongBan_Id,
      });
      message.success(`Đã thu ${phaiThu.toLocaleString("vi-VN")}đ (HĐ #${hoaDonId})`);
      onSuccess?.();
      onClose();
    } catch (e) {
      message.error(e?.message || "Lỗi thu tiền");
    } finally {
      setSubmitting(false);
    }
  };

  const cols = [
    { title: "Loại", dataIndex: "Loai", width: 100, render: (v) => <Tag color={v === "Thuoc" ? "magenta" : v === "KhamBenh" ? "blue" : "green"}>{v}</Tag> },
    { title: "Dịch vụ", dataIndex: "TenDichVu", ellipsis: true },
    { title: "SL", dataIndex: "SoLuong", width: 60, align: "center" },
    { title: "Đơn giá", dataIndex: "DonGia", width: 110, align: "right", render: (v) => (v || 0).toLocaleString("vi-VN") + "đ" },
    { title: "Thành tiền", dataIndex: "ThanhTien", width: 110, align: "right", render: (v) => <b>{(v || 0).toLocaleString("vi-VN")}đ</b> },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={780}
      title={`💵 Hoá đơn viện phí ${daCoHd ? `· ${data?.SoHoaDon}` : "(chưa lập)"}`}
      footer={[
        <Button key="c" onClick={onClose}>
          Đóng
        </Button>,
        !daThu && (
          <Button key="s" type="primary" loading={submitting} onClick={handleLapVaThu}>
            {daCoHd ? "Thu tiền + Hoàn tất" : "Lập HĐ + Thu tiền + Hoàn tất"}
          </Button>
        ),
      ]}
      destroyOnClose
    >
      {!tiepNhanId ? (
        <Alert showIcon type="warning" message="Chưa có BN đang gọi" />
      ) : !data ? (
        <Alert showIcon type="info" message="Đang tải hoặc BN chưa có chi phí nào để lập hoá đơn" />
      ) : daThu ? (
        <Alert
          showIcon
          type="success"
          message={`Đã thu tiền ${data?.NgayThu ? new Date(data.NgayThu).toLocaleString("vi-VN") : ""}`}
          description={`Người thu: ${data?.TenNhanVienThu || "—"} · Phương thức: ${data?.PhuongThuc || "—"}`}
        />
      ) : (
        <>
          <Table size="small" pagination={false} dataSource={items} rowKey={(r, i) => i} columns={cols} />
          <Descriptions size="small" column={2} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Tổng tiền gốc">
              <b>{tongGoc.toLocaleString("vi-VN")}đ</b>
            </Descriptions.Item>
            <Descriptions.Item label="Miễn giảm">
              <InputNumber
                value={mienGiam}
                onChange={(v) => setMienGiam(v || 0)}
                disabled={daCoHd}
                min={0}
                max={tongGoc}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                style={{ width: 140 }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="BHYT chi trả">
              <InputNumber
                value={bhyt}
                onChange={(v) => setBhyt(v || 0)}
                disabled={daCoHd}
                min={0}
                max={tongGoc - (mienGiam || 0)}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                style={{ width: 140 }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Phương thức">
              <Radio.Group value={phuongThuc} onChange={(e) => setPhuongThuc(e.target.value)}>
                <Radio value="TienMat">Tiền mặt</Radio>
                <Radio value="Chuyen">Chuyển khoản</Radio>
                <Radio value="The">Thẻ</Radio>
              </Radio.Group>
            </Descriptions.Item>
            <Descriptions.Item label="Bệnh nhân phải thu" span={2}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>
                {phaiThu.toLocaleString("vi-VN")}đ
              </span>
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Modal>
  );
}
