import {
  DeleteOutlined,
  EditOutlined,
  NotificationOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import http from "../../util/httpClient";
import PageHeader from "../../component/PageHeader";

const BASE = "/danh-muc/admin";

export default function NoiDungDacBiet() {
  const [rows, setRows] = useState([]);
  const [hdPbOptions, setHdPbOptions] = useState([]);
  const [hdOptions, setHdOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, hdPbRes, hdRes] = await Promise.all([
        http.get(`${BASE}/noi-dung-dac-biet`),
        http.get(`${BASE}/cbb/hang-doi-phong-ban`),
        http.get(`${BASE}/cbb/hang-doi`),
      ]);
      setRows(listRes?.data || []);
      setHdPbOptions(hdPbRes?.data || []);
      setHdOptions(hdRes?.data || []);
    } catch (e) {
      message.error(e?.message || "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ tamNgung: false, phongBanId: null, hangDoiId: null, idLienQuan: 0 });
    setModal({ open: true, editing: null });
  };

  const openEdit = (row) => {
    form.setFieldsValue({
      tenNoiDung: row.TenNoiDung,
      loai: row.Loai || "",
      phongBanId: row.PhongBan_Id || null,
      hangDoiId: row.HangDoi_Id || null,
      idLienQuan: row.IdLienQuan || 0,
      tamNgung: row.TamNgung === true || row.TamNgung === 1,
    });
    setModal({ open: true, editing: row });
  };

  const close = () => setModal({ open: false, editing: null });

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const payload = {
        tenNoiDung: v.tenNoiDung.trim(),
        loai: v.loai || null,
        phongBanId: v.phongBanId || null,
        hangDoiId: v.hangDoiId || null,
        idLienQuan: v.idLienQuan || 0,
        tamNgung: !!v.tamNgung,
      };
      const res = modal.editing
        ? await http.put(`${BASE}/noi-dung-dac-biet/${modal.editing.Id}`, payload)
        : await http.post(`${BASE}/noi-dung-dac-biet`, payload);
      if (res?.data?.ok) {
        message.success(res.data.message);
        close();
        load();
      } else {
        message.error(res?.data?.message || "Lưu thất bại");
      }
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    try {
      const res = await http.del(`${BASE}/noi-dung-dac-biet/${row.Id}`);
      if (res?.data?.ok) {
        message.success(res.data.message);
        load();
      } else {
        message.error(res?.data?.message || "Xóa thất bại");
      }
    } catch (e) {
      message.error(e?.message || "Lỗi xóa");
    }
  };

  const columns = [
    { title: "Tên nội dung", dataIndex: "TenNoiDung", key: "TenNoiDung" },
    { title: "Loại", dataIndex: "Loai", key: "Loai", width: 130, render: (v) => v || "—" },
    { title: "Phòng ban", dataIndex: "TenPhongBan", key: "TenPhongBan", render: (v) => v || "—" },
    { title: "Hàng đợi", dataIndex: "TenHangDoi", key: "TenHangDoi", render: (v) => v || "—" },
    {
      title: "Trạng thái",
      dataIndex: "TamNgung",
      key: "TamNgung",
      width: 140,
      render: (v) => (v === true || v === 1
        ? <Tag color="red">Tạm ngừng</Tag>
        : <Tag color="green">Hoạt động</Tag>),
    },
    {
      title: "",
      key: "a",
      width: 110,
      fixed: "right",
      render: (_, row) => (
        <Space>
          <Tooltip title="Sửa">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Popconfirm
            title={`Xóa "${row.TenNoiDung}"?`}
            onConfirm={() => handleDelete(row)}
            okText="Xóa"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
          >
            <Tooltip title="Xóa">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<NotificationOutlined />}
        title="Nội dung đặc biệt"
        extra={
          <>
            <PageHeader.Button icon={<ReloadOutlined />} onClick={load}>Tải lại</PageHeader.Button>
            <PageHeader.Button icon={<PlusOutlined />} onClick={openCreate}>Thêm mới</PageHeader.Button>
          </>
        }
      />

      <Table
        rowKey="Id"
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 15, showSizeChanger: true }}
      />

      <Modal
        open={modal.open}
        title={modal.editing ? `Sửa: ${modal.editing.TenNoiDung}` : "Thêm nội dung"}
        onCancel={close}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="tenNoiDung" label="Tên nội dung" rules={[{ required: true, message: "Nhập tên nội dung" }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="loai" label="Loại">
            <Input placeholder="VD: MARQUEE, GIOITHIEU..." />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="phongBanId" label="Phòng ban">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chọn phòng ban"
                options={hdPbOptions.map((p) => ({
                  label: p.TenPhongBan || p.FieldName || p.Text || `PB ${p.PhongBan_Id}`,
                  value: p.PhongBan_Id,
                }))}
              />
            </Form.Item>
            <Form.Item name="hangDoiId" label="Hàng đợi">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chọn hàng đợi"
                options={hdOptions.map((h) => ({
                  label: h.TenHangDoi || h.FieldName || `HD ${h.HangDoi_Id}`,
                  value: h.HangDoi_Id,
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="idLienQuan" label="ID liên quan">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="tamNgung" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Tạm ngừng" unCheckedChildren="Hoạt động" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
