import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Form, Input, Modal, Tag, message } from "antd";
import http from "../../util/httpClient";

const { TextArea } = Input;

/**
 * Modal cho KTV trả kết quả CLS/CDHA.
 * Props: open, onClose, patient (HangDoiPhongBan row), onSuccess()
 */
export default function CLSResultModal({ open, onClose, patient, onSuccess }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!open || !patient?.HangDoiPhongBan_Id) return;
    form.resetFields();
    (async () => {
      try {
        const res = await http.get(`/cls/cho-tra-kq/${patient.HangDoiPhongBan_Id}`);
        setInfo(res?.data || null);
      } catch (e) {
        console.error(e);
        setInfo(null);
      }
    })();
  }, [open, patient?.HangDoiPhongBan_Id, form]);

  const handleSubmit = async () => {
    try {
      const vals = await form.validateFields();
      if (!info?.DVYEUCAU_ID) {
        message.error("BN chưa có chỉ định CLS");
        return;
      }
      setSubmitting(true);
      await http.post("/cls/tra-kq", {
        dvyeucau_ID: info.DVYEUCAU_ID,
        hangDoiPhongBan_Id: patient.HangDoiPhongBan_Id,
        ketLuan: vals.ketLuan,
        ketQuaChiTiet: vals.ketQuaChiTiet,
        fileDinhKem: vals.fileDinhKem,
      });
      message.success("Đã trả kết quả CLS");
      onSuccess?.();
      onClose();
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || "Lỗi trả kết quả");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={700}
      title="🔬 Trả kết quả CLS / CDHA"
      footer={[
        <Button key="c" onClick={onClose}>
          Huỷ
        </Button>,
        <Button key="s" type="primary" loading={submitting} onClick={handleSubmit}>
          Lưu kết quả + Hoàn tất
        </Button>,
      ]}
      destroyOnClose
    >
      {!patient?.HangDoiPhongBan_Id ? (
        <Alert type="warning" showIcon message="Chưa gọi BN — bấm Gọi số tiếp theo trước" />
      ) : !info?.DVYEUCAU_ID ? (
        <Alert
          type="info"
          showIcon
          message="BN này không có chỉ định CLS gắn với lượt khám"
          description="Có thể BN được đẩy vào hàng đợi do nguyên nhân khác (vd seed demo). Phải có bác sĩ chỉ định CLS từ /kham-benh/quan-ly để KTV trả kết quả."
        />
      ) : (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            style={{ marginBottom: 16 }}
            labelStyle={{ background: "#fafafa", width: 140 }}
          >
            <Descriptions.Item label="Bệnh nhân">
              {info.TenBenhNhan} ({info.NamSinh || "?"})
            </Descriptions.Item>
            <Descriptions.Item label="STT">{info.SoThuTuDayDu}</Descriptions.Item>
            <Descriptions.Item label="Số phiếu YC">{info.SOPHIEUYEUCAU}</Descriptions.Item>
            <Descriptions.Item label="Loại DV">
              <Tag color="blue">{info.LoaiDV}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Dịch vụ" span={2}>
              <b>{info.TENDICHVU}</b>{" "}
              <span style={{ color: "#64748b" }}>
                ({(info.DonGia || 0).toLocaleString("vi-VN")}đ)
              </span>
            </Descriptions.Item>
            {info.DaCoKetQua && (
              <Descriptions.Item label="⚠ Đã có KQ trước" span={2}>
                <span style={{ color: "#dc2626" }}>{info.KetLuanCu}</span>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Form form={form} layout="vertical">
            <Form.Item
              label="Kết luận"
              name="ketLuan"
              rules={[{ required: true, message: "Bắt buộc nhập kết luận" }]}
            >
              <TextArea rows={2} placeholder="VD: Bình thường / Có bất thường ABC..." autoFocus />
            </Form.Item>
            <Form.Item label="Chi tiết kết quả" name="ketQuaChiTiet">
              <TextArea rows={4} placeholder="Mô tả chi tiết: chỉ số, hình ảnh, lưu ý..." />
            </Form.Item>
            <Form.Item label="File đính kèm (URL)" name="fileDinhKem">
              <Input placeholder="VD: /uploads/xq-2026-05-29-1.jpg" />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
