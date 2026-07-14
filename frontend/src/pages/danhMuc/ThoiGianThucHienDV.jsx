import {
  DeleteOutlined,
  EditOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Form,
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

export default function ThoiGianThucHienDV() {
  const [rows, setRows] = useState([]);
  const [dichVuOptions, setDichVuOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, cbbRes] = await Promise.all([
        http.get(`${BASE}/thoi-gian`),
        http.get(`${BASE}/cbb/dich-vu`),
      ]);
      setRows(listRes?.data || []);
      setDichVuOptions(cbbRes?.data || []);
    } catch (e) {
      message.error(e?.message || "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ tamNgung: false, soPhut: 5 });
    setModal({ open: true, editing: null });
  };

  const openEdit = (row) => {
    form.setFieldsValue({
      soPhut: row.SoPhut || 5,
      dichVuId: row.DichVu_Id,
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
        soPhut: Number(v.soPhut || 0),
        dichVuId: Number(v.dichVuId || 0),
        tamNgung: !!v.tamNgung,
      };
      const res = modal.editing
        ? await http.put(`${BASE}/thoi-gian/${modal.editing.Id}`, payload)
        : await http.post(`${BASE}/thoi-gian`, payload);
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
    const res = await http.del(`${BASE}/thoi-gian/${row.Id}`);
    if (res?.data?.ok) { message.success(res.data.message); load(); }
    else message.error(res?.data?.message || "Xóa thất bại");
  };

  const columns = [
    { title: "Tên dịch vụ", dataIndex: "TenDichVu", key: "TenDichVu" },
    { title: "Nhóm", dataIndex: "NhomDichVu", key: "NhomDichVu", render: (v) => v || "—" },
    {
      title: "Thời gian (phút)",
      dataIndex: "SoPhut",
      key: "SoPhut",
      width: 160,
      render: (v) => <Tag color="blue">{v} phút</Tag>,
    },
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
          <Tooltip title="Sửa"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Tooltip>
          <Popconfirm
            title={`Xóa SLA "${row.TenDichVu}"?`}
            onConfirm={() => handleDelete(row)}
            okText="Xóa"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
          >
            <Tooltip title="Xóa"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<FieldTimeOutlined />}
        title="Thời gian thực hiện dịch vụ"
        extra={
          <>
            <PageHeader.Button icon={<ReloadOutlined />} onClick={load}>Tải lại</PageHeader.Button>
            <PageHeader.Button icon={<PlusOutlined />} onClick={openCreate}>Thêm mới</PageHeader.Button>
          </>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Số phút trung bình này là baseline cho module dự báo thời gian chờ — được dùng làm giá trị khởi tạo trước khi EWMA học từ log thực tế."
      />

      <Table
        rowKey="Id"
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 700 }}
        pagination={{ pageSize: 15, showSizeChanger: true }}
      />

      <Modal
        open={modal.open}
        title={modal.editing ? "Sửa SLA dịch vụ" : "Thêm SLA dịch vụ"}
        onCancel={close}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="dichVuId"
            label="Dịch vụ"
            rules={[{ required: true, message: "Chọn dịch vụ" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn dịch vụ"
              disabled={!!modal.editing}
              options={dichVuOptions.map((d) => ({
                label: d.TenDichVu || d.FieldName || `DV ${d.DichVu_Id}`,
                value: d.DichVu_Id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="soPhut"
            label="Số phút trung bình"
            rules={[
              { required: true, message: "Nhập số phút" },
              { type: "number", min: 1, max: 240, message: "Từ 1 đến 240 phút" },
            ]}
          >
            <InputNumber min={1} max={240} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="tamNgung" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Tạm ngừng" unCheckedChildren="Hoạt động" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
