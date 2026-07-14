import { DeleteOutlined, ExperimentOutlined, MedicineBoxOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  message
} from "antd";
import { useEffect, useState } from "react";
import http from "../../util/httpClient";
import PhieuChiDinhModal from "../PhieuChiDinhModal";

const { TextArea } = Input;

/**
 * Modal cho bác sĩ submit 1 lượt khám: chẩn đoán + chỉ định CLS/CDHA + kê đơn.
 * Props:
 *   open, onClose, patient (HangDoiPhongBan row của BN đang khám), tenBacSi
 *   onSuccess(): refetch queue sau khi submit OK
 */
export default function DoctorActionsModal({ open, onClose, patient, tenBacSi, onSuccess, onTransfer }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("chan-doan");

  // Phiếu chỉ định để in sau khi submit (mô hình scan-on-arrival)
  const [phieuOpen, setPhieuOpen] = useState(false);
  const [phieuList, setPhieuList] = useState([]);

  const [dvCLS, setDvCLS] = useState([]);
  const [dvCDHA, setDvCDHA] = useState([]);
  const [dvThuoc, setDvThuoc] = useState([]);

  // Rows được bác sĩ pick
  const [pickedCLS, setPickedCLS] = useState([]);
  const [pickedThuoc, setPickedThuoc] = useState([]);

  // Mở modal: reset rồi NẠP LẠI bệnh án nếu lượt khám đã có (sửa, không mất
  // record cũ). Chưa có → chỉ prefill "Lý do khám" từ phiếu tiếp nhận.
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setPickedCLS([]);
    setPickedThuoc([]);
    setActiveTab("chan-doan");

    const hdpb = patient?.HangDoiPhongBan_Id;
    const tnId = patient?.TIEPNHAN_ID || patient?.TiepNhan_Id;

    (async () => {
      // 1) Lượt khám đã có bệnh án → load lại đầy đủ (chẩn đoán + CLS + thuốc).
      let loaded = false;
      if (hdpb) {
        try {
          const res = await http.get(`/benh-an/by-hdpb/${hdpb}`);
          const ba = res?.data;
          if (ba && ba.BenhAn_Id) {
            form.setFieldsValue({
              lyDoKham: ba.LyDoKham,
              trieuChung: ba.TrieuChung,
              chanDoan: ba.ChanDoan,
              chanDoanICD: ba.ChanDoanICD,
              huongDieuTri: ba.HuongDieuTri,
              ghiChu: ba.GhiChu,
            });
            setPickedCLS(
              (ba.ChiDinhCLS || [])
                .filter((c) => c.DICHVU_ID)
                .map((c) => ({
                  key: c.DVYEUCAU_ID || c.DICHVU_ID,
                  DichVu_Id: c.DICHVU_ID,
                  TenDichVu: c.TENDICHVU,
                  DonGia: c.DonGia,
                  SoLuong: 1,
                })),
            );
            setPickedThuoc(
              (ba.Thuoc || []).map((t) => ({
                key: t.ChiTiet_Id,
                DichVu_Id: t.DichVu_Id,
                TenThuoc: t.TenThuoc,
                DonViTinh: t.DonViTinh,
                DonGia: t.DonGia,
                SoLuong: t.SoLuong,
                LieuDung: t.LieuDung,
              })),
            );
            loaded = true;
          }
        } catch {
          /* ignore */
        }
      }

      // 2) Chưa có bệnh án → prefill lý do khám từ tiếp nhận.
      if (!loaded && tnId) {
        try {
          const res = await http.get(`/benh-an/tiep-nhan-info/${tnId}`);
          const lyDo = res?.data?.LyDoKham;
          if (lyDo && !form.getFieldValue("lyDoKham")) {
            form.setFieldsValue({ lyDoKham: lyDo });
          }
        } catch {
          /* ignore */
        }
      }
    })();
  }, [open, form, patient?.HangDoiPhongBan_Id, patient?.TIEPNHAN_ID, patient?.TiepNhan_Id]);

  // Load DM dịch vụ (1 lần)
  useEffect(() => {
    (async () => {
      try {
        const [cls, cdha, thuoc] = await Promise.all([
          http.get("/benh-an/dich-vu", { loai: "CLS" }),
          http.get("/benh-an/dich-vu", { loai: "CDHA" }),
          http.get("/benh-an/dich-vu", { loai: "Thuoc" }),
        ]);
        setDvCLS(cls?.data || []);
        setDvCDHA(cdha?.data || []);
        setDvThuoc(thuoc?.data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Options gộp CLS + CDHA cho dropdown chỉ định
  const dvCLSAll = [
    ...dvCLS.map((d) => ({ ...d, _group: "Xét nghiệm" })),
    ...dvCDHA.map((d) => ({ ...d, _group: "Chẩn đoán hình ảnh" })),
  ];

  const addCLS = (dichVuId) => {
    const dv = dvCLSAll.find((x) => x.DICHVU_ID === dichVuId);
    if (!dv) return;
    if (pickedCLS.some((p) => p.DichVu_Id === dichVuId)) {
      message.warning("Dịch vụ đã có trong chỉ định");
      return;
    }
    setPickedCLS([
      ...pickedCLS,
      { key: Date.now(), DichVu_Id: dv.DICHVU_ID, TenDichVu: dv.TENDICHVU, DonGia: dv.DonGia, SoLuong: 1 },
    ]);
  };

  const addThuoc = (dichVuId) => {
    const dv = dvThuoc.find((x) => x.DICHVU_ID === dichVuId);
    if (!dv) return;
    if (pickedThuoc.some((p) => p.DichVu_Id === dichVuId)) {
      message.warning("Thuốc đã có trong đơn");
      return;
    }
    setPickedThuoc([
      ...pickedThuoc,
      {
        key: Date.now(),
        DichVu_Id: dv.DICHVU_ID,
        TenThuoc: dv.TENDICHVU,
        DonViTinh: dv.DonViTinh,
        DonGia: dv.DonGia,
        SoLuong: 1,
        LieuDung: "",
      },
    ]);
  };

  const updPicked = (setter) => (key, field, value) => {
    setter((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };
  const rmPicked = (setter) => (key) => setter((rows) => rows.filter((r) => r.key !== key));

  const handleSubmit = async () => {
    try {
      const vals = await form.validateFields();
      if (!patient?.HangDoiPhongBan_Id || !patient?.BenhNhan_Id) {
        message.error({ key: "no-bn", content: "Chưa chọn bệnh nhân hợp lệ" });
        return;
      }
      setSubmitting(true);
      const payload = {
        hangDoiPhongBan_Id: patient.HangDoiPhongBan_Id,
        tiepNhan_Id: patient.TIEPNHAN_ID || patient.TiepNhan_Id || 0,
        benhNhan_Id: patient.BenhNhan_Id,
        lyDoKham: vals.lyDoKham,
        trieuChung: vals.trieuChung,
        chanDoan: vals.chanDoan,
        chanDoanICD: vals.chanDoanICD,
        huongDieuTri: vals.huongDieuTri,
        ghiChu: vals.ghiChu,
        thuTienSau: vals.thuTienSau !== false, // default true
        chiDinhCLS: pickedCLS.map((r) => ({
          dichVu_Id: r.DichVu_Id,
          soLuong: r.SoLuong || 1,
        })),
        donThuoc: pickedThuoc.map((r) => ({
          dichVu_Id: r.DichVu_Id,
          tenThuoc: r.TenThuoc,
          soLuong: r.SoLuong || 1,
          donViTinh: r.DonViTinh,
          lieuDung: r.LieuDung,
        })),
      };
      const res = await http.post("/benh-an", payload);
      const phieus = res?.data?.phieus || [];
      message.success("Đã lưu bệnh án.");
      onSuccess?.();
      onClose();
      // LUÔN mở modal bước-tiếp-theo: có CLS → in phiếu cho BN đi làm CLS;
      // không CLS → chọn chuyển Viện phí/Nhà thuốc/Hoàn tất. KHÔNG tự đẩy
      // hàng đợi (mô hình doctor-transfer).
      setPhieuList(phieus);
      setPhieuOpen(true);
    } catch (err) {
      if (err?.errorFields) return; // form validation error
      message.error(err?.message || "Lỗi tạo bệnh án");
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = [
    {
      key: "chan-doan",
      label: "🩺 Chẩn đoán",
      children: (
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item label="Lý do khám" name="lyDoKham">
            <Input placeholder="Ví dụ: Ho kéo dài, đau bụng..." />
          </Form.Item>
          <Form.Item label="Triệu chứng" name="trieuChung">
            <TextArea rows={2} placeholder="Mô tả triệu chứng chi tiết" />
          </Form.Item>
          <Form.Item
            label="Chẩn đoán"
            name="chanDoan"
            rules={[{ required: true, message: "Bắt buộc nhập chẩn đoán" }]}
          >
            <TextArea rows={2} placeholder="Chẩn đoán y khoa" autoFocus />
          </Form.Item>
          <Form.Item label="Mã ICD-10 (tuỳ chọn)" name="chanDoanICD">
            <Input placeholder="VD: J00, K29.7..." />
          </Form.Item>
          <Form.Item label="Hướng điều trị" name="huongDieuTri">
            <TextArea rows={2} placeholder="Tư vấn / hẹn tái khám / chuyển tuyến..." />
          </Form.Item>
          <Form.Item label="Ghi chú" name="ghiChu">
            <Input />
          </Form.Item>

        </Form>
      ),
    },
    {
      key: "chi-dinh",
      label: `🔬 Chỉ định CLS (${pickedCLS.length})`,
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Select
              showSearch
              style={{ width: 380 }}
              placeholder="Chọn dịch vụ CLS/CDHA để thêm"
              optionFilterProp="label"
              onChange={(v) => addCLS(v)}
              value={null}
              options={dvCLSAll.map((d) => ({
                value: d.DICHVU_ID,
                label: `[${d._group}] ${d.TENDICHVU}`,
              }))}
            />
            <span style={{ color: "#64748b" }}>
              <ExperimentOutlined /> {dvCLS.length} XN · {dvCDHA.length} CDHA
            </span>
          </Space>
          <Table
            size="small"
            pagination={false}
            dataSource={pickedCLS}
            rowKey="key"
            columns={[
              { title: "Dịch vụ", dataIndex: "TenDichVu", ellipsis: true },
              {
                title: "",
                width: 50,
                render: (_, r) => (
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => rmPicked(setPickedCLS)(r.key)} />
                ),
              },
            ]}
            locale={{ emptyText: "Chưa chỉ định gì" }}
          />
        </>
      ),
    },
    {
      key: "thuoc",
      label: `💊 Đơn thuốc (${pickedThuoc.length})`,
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Select
              showSearch
              style={{ width: 380 }}
              placeholder="Chọn thuốc để thêm"
              optionFilterProp="label"
              onChange={(v) => addThuoc(v)}
              value={null}
              options={dvThuoc.map((d) => ({
                value: d.DICHVU_ID,
                label: `${d.TENDICHVU}${d.DonViTinh ? ` (${d.DonViTinh})` : ""}`,
              }))}
            />
            <span style={{ color: "#64748b" }}>
              <MedicineBoxOutlined /> {dvThuoc.length} thuốc
            </span>
          </Space>
          <Table
            size="small"
            pagination={false}
            dataSource={pickedThuoc}
            rowKey="key"
            columns={[
              { title: "Thuốc", dataIndex: "TenThuoc", ellipsis: true },
              { title: "ĐV", dataIndex: "DonViTinh", width: 70 },
              {
                title: "Liều dùng",
                dataIndex: "LieuDung",
                render: (v, r) => (
                  <Input
                    placeholder="VD: 1v × 3 lần/ngày sau ăn"
                    value={v}
                    onChange={(e) => updPicked(setPickedThuoc)(r.key, "LieuDung", e.target.value)}
                  />
                ),
              },
              {
                title: "",
                width: 50,
                render: (_, r) => (
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => rmPicked(setPickedThuoc)(r.key)} />
                ),
              },
            ]}
            locale={{ emptyText: "Chưa kê thuốc" }}
          />
        </>
      ),
    },
  ];

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width={920}
        title={
          <Space>
            <span>🩺 Bệnh án + Chỉ định</span>
            {patient?.TenBenhNhan && (
              <span style={{ fontSize: 13, color: "#1677ff" }}>
                · {patient.TenBenhNhan} · STT {patient.SoThuTuDayDu}
              </span>
            )}
            {tenBacSi && <span style={{ fontSize: 13, color: "#64748b" }}>· BS {tenBacSi}</span>}
          </Space>
        }
        footer={[
          <Button key="cancel" onClick={onClose}>
            Huỷ
          </Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit}>
            Lưu bệnh án + Đẩy BN qua bước tiếp
          </Button>,
        ]}
        destroyOnClose
      >
        {!patient?.HangDoiPhongBan_Id ? (
          <Alert
            showIcon
            type="warning"
            message="Chưa gọi BN nào — vui lòng bấm Gọi số tiếp theo trước"
          />
        ) : (
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
        )}
      </Modal>

      <PhieuChiDinhModal
        open={phieuOpen}
        onClose={() => setPhieuOpen(false)}
        patient={patient}
        tenBacSi={tenBacSi}
        phieus={phieuList}
        onTransfer={onTransfer}
      />
    </>
  );
}
