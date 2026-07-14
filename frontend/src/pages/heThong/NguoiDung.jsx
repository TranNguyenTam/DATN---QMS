import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Alert,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

/**
 * Trang Quản lý người dùng — gộp 2 nhiệm vụ:
 *   1. CRUD account (UserCode + UserName + Password + thiết bị + trạng thái).
 *   2. Gán role RBAC cho mỗi user (modal multi-select).
 * → Hỏi "Ai có tài khoản và làm role gì?" duy nhất ở trang này.
 * Trang Vai trò & Phân quyền menu chỉ lo CRUD role + tick permission.
 *
 * Backend: SP_001_Users (CRUD) + /admin/roles/users (Roles aggregate)
 * + /admin/roles/assign|unassign.
 */
export default function NguoiDung() {
  const [rows, setRows] = useState([]);
  const [userRolesMap, setUserRolesMap] = useState({});  // UserCode → "BAC_SI, KTV_CLS"
  const [rolesList, setRolesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Role assign modal
  const [roleModal, setRoleModal] = useState({ open: false, user: null });
  const [roleSelected, setRoleSelected] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load song song: users + user-role map + role list
      const [resUsers, resUR, resRoles] = await Promise.all([
        http.get("/system/users"),
        http.get("/admin/roles/users").catch(() => ({ data: [] })),
        http.get("/admin/roles").catch(() => ({ data: [] })),
      ]);
      setRows(resUsers?.data || []);
      const map = {};
      (resUR?.data || []).forEach((u) => {
        map[u.UserCode] = u.Roles || "";
      });
      setUserRolesMap(map);
      setRolesList(resRoles?.data || []);
    } catch (e) {
      message.error(e?.message || "Không tải được danh sách người dùng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Role assign ─────────────────────────────────────────────
  const openRoleModal = (user) => {
    const cur = (userRolesMap[user.UserCode] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ids = rolesList.filter((r) => cur.includes(r.RoleCode)).map((r) => r.Role_Id);
    setRoleSelected(ids);
    setRoleModal({ open: true, user });
  };

  const saveUserRoles = async () => {
    if (!roleModal.user) return;
    try {
      const cur = (userRolesMap[roleModal.user.UserCode] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const curIds = new Set(
        rolesList.filter((r) => cur.includes(r.RoleCode)).map((r) => r.Role_Id),
      );
      const newIds = new Set(roleSelected);
      const toAdd = [...newIds].filter((id) => !curIds.has(id));
      const toRemove = [...curIds].filter((id) => !newIds.has(id));

      for (const rid of toAdd)
        await http.post("/admin/roles/assign", { userId: roleModal.user.User_Id, roleId: rid });
      for (const rid of toRemove)
        await http.post("/admin/roles/unassign", { userId: roleModal.user.User_Id, roleId: rid });

      message.success("Đã cập nhật role. User cần đăng nhập lại để JWT cập nhật quyền.");
      setRoleModal({ open: false, user: null });
      load();
    } catch (e) {
      message.error(e?.message || "Lỗi gán role");
    }
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ tamNgung: false });
    setModal({ open: true, editing: null });
  };

  const openEdit = (row) => {
    form.setFieldsValue({
      userCode: row.UserCode,
      userName: row.UserName,
      password: "",
      tamNgung: row.TamNgung === true || row.TamNgung === 1,
      moTaMay: row.MoTa1 || "",
      moTaKetNoiMay: row.MoTa2 || "",
      moTaKetNoiTiVi: row.MoTa3 || "",
      moTaKetNoiAmThanh: row.MoTa4 || "",
    });
    setModal({ open: true, editing: row });
  };

  const close = () => setModal({ open: false, editing: null });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        userCode: values.userCode.trim(),
        userName: values.userName.trim(),
        password: values.password || null,
        tamNgung: !!values.tamNgung,
        moTaMay: values.moTaMay || null,
        moTaKetNoiMay: values.moTaKetNoiMay || null,
        moTaKetNoiTiVi: values.moTaKetNoiTiVi || null,
        moTaKetNoiAmThanh: values.moTaKetNoiAmThanh || null,
      };
      const editing = modal.editing;
      const res = editing
        ? await http.put(`/system/users/${editing.User_Id}`, payload)
        : await http.post("/system/users", payload);
      if (res?.data?.ok) {
        message.success(res.data.message);
        close();
        load();
      } else {
        message.error(res?.data?.message || "Lưu thất bại");
      }
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || "Lỗi lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    try {
      const res = await http.del(`/system/users/${row.User_Id}`);
      if (res?.data?.ok) {
        message.success(res.data.message);
        load();
      } else {
        message.error(res?.data?.message || "Không xóa được");
      }
    } catch (e) {
      message.error(e?.message || "Lỗi xóa");
    }
  };

  const kw = search.trim().toLowerCase();
  const filtered = kw
    ? rows.filter(
        (r) =>
          (r.UserCode || "").toLowerCase().includes(kw) ||
          (r.UserName || "").toLowerCase().includes(kw),
      )
    : rows;

  const columns = [
    { title: "Mã", dataIndex: "UserCode", key: "UserCode", width: 140 },
    { title: "Họ tên", dataIndex: "UserName", key: "UserName" },
    {
      title: "Roles",
      key: "Roles",
      width: 220,
      render: (_, row) => {
        const r = userRolesMap[row.UserCode] || "";
        if (!r) return <Tag>Chưa gán</Tag>;
        return r.split(",").map((c) => (
          <Tag color="blue" key={c.trim()}>
            {c.trim()}
          </Tag>
        ));
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "TamNgung",
      key: "TamNgung",
      width: 130,
      render: (v) =>
        v === true || v === 1 ? (
          <Tag color="red">Tạm ngừng</Tag>
        ) : (
          <Tag color="green">Đang hoạt động</Tag>
        ),
    },
    { title: "Máy", dataIndex: "MoTa1", key: "MoTa1", ellipsis: true },
    {
      title: "",
      key: "action",
      width: 170,
      fixed: "right",
      render: (_, row) => (
        <Space>
          <Tooltip title="Gán role">
            <Button size="small" type="primary" ghost onClick={() => openRoleModal(row)}>
              Gán role
            </Button>
          </Tooltip>
          <Tooltip title="Sửa account">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Popconfirm
            title={`Xóa người dùng ${row.UserCode}?`}
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
        icon={<TeamOutlined />}
        title="Quản lý người dùng"
        subtitle="Tài khoản + vai trò người dùng hệ thống."
        extra={
          <>
            <Input.Search
              placeholder="Tìm mã hoặc tên"
              allowClear
              style={{ width: 260 }}
              onChange={(e) => setSearch(e.target.value)}
            />
            <PageHeader.Button icon={<ReloadOutlined />} onClick={load}>
              Tải lại
            </PageHeader.Button>
            <PageHeader.Button icon={<PlusOutlined />} onClick={openCreate}>
              Thêm người dùng
            </PageHeader.Button>
          </>
        }
      />

      <Table
        rowKey="User_Id"
        size="middle"
        loading={loading}
        dataSource={filtered}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{
          pageSize: 15,
          showSizeChanger: true,
          showTotal: (t) => `Tổng ${t} người dùng`,
        }}
      />

      <Modal
        open={modal.open}
        title={modal.editing ? `Sửa người dùng: ${modal.editing.UserCode}` : "Thêm người dùng"}
        onCancel={close}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="userCode"
            label="Mã người dùng"
            rules={[{ required: true, message: "Nhập mã người dùng" }]}
          >
            <Input placeholder="VD: admin01" disabled={!!modal.editing} />
          </Form.Item>
          <Form.Item
            name="userName"
            label="Họ và tên"
            rules={[{ required: true, message: "Nhập họ và tên" }]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="password"
            label={modal.editing ? "Mật khẩu (bỏ trống nếu không đổi)" : "Mật khẩu"}
            rules={modal.editing ? [] : [{ required: true, message: "Nhập mật khẩu" }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="tamNgung" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Tạm ngừng" unCheckedChildren="Hoạt động" />
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="moTaMay" label="Mô tả máy">
              <Input placeholder="Tên máy / vị trí" />
            </Form.Item>
            <Form.Item name="moTaKetNoiMay" label="Kết nối máy">
              <Input placeholder="IP / cổng socket" />
            </Form.Item>
            <Form.Item name="moTaKetNoiTiVi" label="Tivi gán cho máy">
              <Input placeholder="Tên màn hình" />
            </Form.Item>
            <Form.Item name="moTaKetNoiAmThanh" label="Âm thanh gán cho máy">
              <Input placeholder="Tên loa / kênh" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={roleModal.open}
        title={`Gán role cho user: ${roleModal.user?.UserCode || ""}`}
        onCancel={() => setRoleModal({ open: false, user: null })}
        onOk={saveUserRoles}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="Roles">
            <Select
              mode="multiple"
              value={roleSelected}
              onChange={setRoleSelected}
              placeholder="Chọn 1 hoặc nhiều role"
              options={rolesList.map((r) => ({
                value: r.Role_Id,
                label: `${r.RoleCode} — ${r.RoleName}`,
              }))}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Alert
            type="warning"
            showIcon
            message="Sau khi đổi role, user phải đăng nhập lại để JWT cập nhật quyền."
          />
        </Form>
      </Modal>
    </div>
  );
}
