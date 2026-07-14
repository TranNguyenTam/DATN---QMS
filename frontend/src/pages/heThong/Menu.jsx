import {
  DeleteOutlined,
  EditOutlined,
  MenuOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
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
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

export default function Menu() {
  const [rows, setRows] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, parentRes] = await Promise.all([
        http.get("/system/menus"),
        http.get("/system/menus/parents"),
      ]);
      setRows(listRes?.data || []);
      setParents(parentRes?.data || []);
    } catch (e) {
      message.error(e?.message || "Không tải được menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ tamNgung: false, parentMenu: null });
    setModal({ open: true, editing: null });
  };

  const openEdit = (row) => {
    form.setFieldsValue({
      menuCode: row.MenuCode,
      menuName: row.MenuName,
      parentMenu: row.ParentMenu || null,
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
        menuCode: v.menuCode.trim(),
        menuName: v.menuName.trim(),
        parentMenu: v.parentMenu || null,
        tamNgung: !!v.tamNgung,
      };
      const res = modal.editing
        ? await http.put(`/system/menus/${modal.editing.Menu_Id}`, payload)
        : await http.post("/system/menus", payload);
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
      const res = await http.del(`/system/menus/${row.Menu_Id}`);
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
    { title: "Mã menu", dataIndex: "MenuCode", key: "MenuCode", width: 180 },
    { title: "Tên menu", dataIndex: "MenuName", key: "MenuName" },
    {
      title: "Menu cha",
      dataIndex: "ParentMenuName",
      key: "ParentMenuName",
      render: (v) => v || "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "TamNgung",
      key: "TamNgung",
      width: 140,
      render: (v) =>
        v === true || v === 1 ? (
          <Tag color="red">Tạm ngừng</Tag>
        ) : (
          <Tag color="green">Hoạt động</Tag>
        ),
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
            title={`Xóa menu ${row.MenuCode}?`}
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
        icon={<MenuOutlined />}
        title="Quản lý menu"
        extra={
          <>
            <PageHeader.Button icon={<ReloadOutlined />} onClick={load}>
              Tải lại
            </PageHeader.Button>
            <PageHeader.Button icon={<PlusOutlined />} onClick={openCreate}>
              Thêm menu
            </PageHeader.Button>
          </>
        }
      />

      <Table
        rowKey="Menu_Id"
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 800 }}
        pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `Tổng ${t} menu` }}
      />

      <Modal
        open={modal.open}
        title={modal.editing ? `Sửa menu: ${modal.editing.MenuCode}` : "Thêm menu"}
        onCancel={close}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="menuCode" label="Mã menu" rules={[{ required: true, message: "Nhập mã menu" }]}>
            <Input disabled={!!modal.editing} />
          </Form.Item>
          <Form.Item name="menuName" label="Tên menu" rules={[{ required: true, message: "Nhập tên menu" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentMenu" label="Menu cha (để trống nếu là menu gốc)">
            <Select
              allowClear
              placeholder="Chọn menu cha"
              options={parents.map((p) => ({
                label: p.MenuName || p.MenuCode,
                value: p.Menu_Id,
              }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="tamNgung" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Tạm ngừng" unCheckedChildren="Hoạt động" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
