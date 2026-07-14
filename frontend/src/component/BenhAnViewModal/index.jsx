import { useEffect, useState } from "react";
import { Button, Descriptions, Divider, Empty, Modal, Table, Tag, message } from "antd";
import http from "../../util/httpClient";

const fmt = (n) => (n || 0).toLocaleString("vi-VN") + "đ";

/**
 * Modal xem chi tiết 1 bệnh án (chẩn đoán + chỉ định CLS + đơn thuốc).
 * Tự fetch /benh-an/{benhAnId} khi mở. Dùng chung cho Bệnh án+Chỉ định và
 * Lịch sử khám bệnh.
 *
 * Props: open, onClose, benhAnId
 */
export default function BenhAnViewModal({ open, onClose, benhAnId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !benhAnId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setData(null);
      try {
        const res = await http.get(`/benh-an/${benhAnId}`);
        if (alive) setData(res?.data || { empty: true });
      } catch (e) {
        message.error(e?.message || "Lỗi tải bệnh án");
        if (alive) onClose?.();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, benhAnId, onClose]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      title="📋 Bệnh án + Chỉ định + Đơn thuốc"
      footer={[
        <Button key="c" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      loading={loading}
      destroyOnClose
    >
      {data?.empty ? (
        <Empty description="Không tìm thấy bệnh án" />
      ) : data ? (
        <>
          <Descriptions size="small" column={2} bordered labelStyle={{ width: 120, background: "#fafafa" }}>
            <Descriptions.Item label="Bệnh nhân">{data.TenBenhNhan}</Descriptions.Item>
            <Descriptions.Item label="Năm sinh">{data.NamSinh || "—"}</Descriptions.Item>
            <Descriptions.Item label="Bác sĩ">{data.TenBacSi || "—"}</Descriptions.Item>
            <Descriptions.Item label="Ngày khám">
              {data.NgayKham ? new Date(data.NgayKham).toLocaleString("vi-VN") : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Lý do khám" span={2}>{data.LyDoKham || "—"}</Descriptions.Item>
            <Descriptions.Item label="Triệu chứng" span={2}>{data.TrieuChung || "—"}</Descriptions.Item>
            <Descriptions.Item label="Chẩn đoán" span={2}>
              <b>{data.ChanDoan}</b>
              {data.ChanDoanICD ? ` (${data.ChanDoanICD})` : ""}
            </Descriptions.Item>
            <Descriptions.Item label="Hướng điều trị" span={2}>{data.HuongDieuTri || "—"}</Descriptions.Item>
          </Descriptions>

          <Divider orientation="left" style={{ margin: "16px 0 8px" }}>
            🔬 Chỉ định CLS ({data.ChiDinhCLS?.length || 0})
          </Divider>
          <Table
            size="small"
            pagination={false}
            dataSource={data.ChiDinhCLS || []}
            rowKey={(r) => r.DVYEUCAU_ID}
            locale={{ emptyText: "Không có chỉ định" }}
            columns={[
              { title: "Dịch vụ", dataIndex: "TENDICHVU", ellipsis: true },
              { title: "Loại", dataIndex: "LoaiDV", width: 80, render: (v) => <Tag>{v}</Tag> },
              {
                title: "Kết quả",
                dataIndex: "KetQua_Id",
                width: 120,
                render: (v, r) =>
                  v || r.TRANGTHAI === "CoKetQua" ? (
                    <Tag color="green">Có KQ</Tag>
                  ) : (
                    <Tag color="orange">Chờ KQ</Tag>
                  ),
              },
            ]}
          />

          <Divider orientation="left" style={{ margin: "16px 0 8px" }}>
            💊 Đơn thuốc ({data.Thuoc?.length || 0})
          </Divider>
          <Table
            size="small"
            pagination={false}
            dataSource={data.Thuoc || []}
            rowKey={(r) => r.ChiTiet_Id}
            locale={{ emptyText: "Không kê thuốc" }}
            columns={[
              { title: "Thuốc", dataIndex: "TenThuoc", ellipsis: true },
              { title: "ĐV", dataIndex: "DonViTinh", width: 60 },
              { title: "Liều dùng", dataIndex: "LieuDung", ellipsis: true },
            ]}
          />
        </>
      ) : null}
    </Modal>
  );
}
