import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../component/PageHeader";
import { ALL_MENU_ITEMS } from "../../../config/menuConfig";
import http from "../../../util/httpClient";

const { Text } = Typography;

/**
 * Trang Vai trò & Phân quyền menu — chỉ ADMIN truy cập.
 * Quản lý 2 việc DUY NHẤT:
 *   1. CRUD role (Code/Name/Description/TamNgung).
 *   2. Cấu hình mỗi role được truy cập menu nào (tick tree permission).
 *
 * Việc "Gán role cho user" → MOVE sang Quản lý người dùng (1 trang quản
 * lý account + role cho mạch hơn). Trang này không còn tab Users.
 */
export default function QuanLyQuyen() {
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  // Role create/edit modal
  const [roleModal, setRoleModal] = useState({ open: false, editing: null });
  const [roleForm] = Form.useForm();

  // Permission modal (per role)
  const [permModal, setPermModal] = useState({ open: false, role: null });
  const [permChecked, setPermChecked] = useState([]);

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const res = await http.get("/admin/roles");
      setRoles(res?.data || []);
    } catch (e) {
      message.error(e?.message || "Lỗi tải roles");
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  // ── Permission tree từ menuConfig ────────────────────────────
  const permTree = useMemo(() => {
    const map = (items) =>
      items.map((it) => ({
        title: (
          <span>
            {it.label || it.key}{" "}
            <Tag style={{ marginLeft: 4, fontSize: 10 }}>
              {it.permissionKey || it.key}
            </Tag>
          </span>
        ),
        key: it.permissionKey || it.key,
        children: it.children ? map(it.children) : undefined,
      }));
    return map(ALL_MENU_ITEMS);
  }, []);

  // ── Role CRUD ───────────────────────────────────────────────
  const openCreateRole = () => {
    roleForm.resetFields();
    setRoleModal({ open: true, editing: null });
  };
  const openEditRole = (role) => {
    roleForm.setFieldsValue({
      RoleName: role.RoleName,
      Description: role.Description,
      TamNgung: role.TamNgung,
    });
    setRoleModal({ open: true, editing: role });
  };
  const submitRole = async () => {
    try {
      const vals = await roleForm.validateFields();
      if (roleModal.editing) {
        await http.put(`/admin/roles/${roleModal.editing.Role_Id}`, {
          name: vals.RoleName,
          description: vals.Description,
          tamNgung: !!vals.TamNgung,
        });
        message.success("Đã cập nhật role");
      } else {
        await http.post("/admin/roles", {
          code: (vals.RoleCode || "").trim().toUpperCase(),
          name: vals.RoleName,
          description: vals.Description,
        });
        message.success("Đã tạo role");
      }
      setRoleModal({ open: false, editing: null });
      fetchRoles();
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || "Lỗi lưu role");
    }
  };
  const deleteRole = async (role) => {
    try {
      await http.del(`/admin/roles/${role.Role_Id}`);
      message.success("Đã xóa role");
      fetchRoles();
    } catch (e) {
      message.error(e?.message || "Không xóa được");
    }
  };

  // ── Permission per role ─────────────────────────────────────
  const openPermModal = async (role) => {
    try {
      const res = await http.get(`/admin/roles/${role.Role_Id}/permissions`);
      setPermChecked(Array.isArray(res?.data) ? res.data : []);
      setPermModal({ open: true, role });
    } catch (e) {
      message.error(e?.message || "Lỗi tải permission");
    }
  };
  const savePerms = async () => {
    if (!permModal.role) return;
    try {
      await http.put(`/admin/roles/${permModal.role.Role_Id}/permissions`, {
        permissionKeys: permChecked,
      });
      message.success(
        `Đã lưu ${permChecked.length} quyền cho ${permModal.role.RoleCode}`,
      );
      setPermModal({ open: false, role: null });
      fetchRoles();
    } catch (e) {
      message.error(e?.message || "Lỗi lưu permission");
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<SafetyCertificateOutlined />}
        title="Vai trò & Phân quyền menu"
        subtitle="Quản lý role và quyền truy cập menu."
      />

      <Card
        size="small"
        title="Danh sách vai trò (Roles)"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateRole}
          >
            Tạo role mới
          </Button>
        }
      >
        <Table
          size="small"
          rowKey="Role_Id"
          loading={loadingRoles}
          dataSource={roles}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: "Code",
              dataIndex: "RoleCode",
              width: 130,
              render: (v) => <Tag color="blue">{v}</Tag>,
            },
            { title: "Tên role", dataIndex: "RoleName" },
            { title: "Mô tả", dataIndex: "Description", ellipsis: true },
            { title: "User", dataIndex: "SoUser", align: "center", width: 70 },
            { title: "Quyền", dataIndex: "SoPerm", align: "center", width: 70 },
            {
              title: "Trạng thái",
              dataIndex: "TamNgung",
              width: 100,
              render: (v) =>
                v ? (
                  <Tag color="red">Tạm ngừng</Tag>
                ) : (
                  <Tag color="green">Hoạt động</Tag>
                ),
            },
            {
              title: "",
              width: 240,
              render: (_, role) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditRole(role)}
                  >
                    Sửa
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    onClick={() => openPermModal(role)}
                  >
                    Quyền ({role.SoPerm})
                  </Button>
                  <Popconfirm
                    title={`Xóa role ${role.RoleCode}?`}
                    disabled={role.RoleCode === "ADMIN"}
                    onConfirm={() => deleteRole(role)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={role.RoleCode === "ADMIN"}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* Role Create/Edit Modal */}
      <Modal
        open={roleModal.open}
        title={
          roleModal.editing
            ? `Sửa role: ${roleModal.editing.RoleCode}`
            : "Tạo role mới"
        }
        onCancel={() => setRoleModal({ open: false, editing: null })}
        onOk={submitRole}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical">
          {!roleModal.editing && (
            <Form.Item
              name="RoleCode"
              label="Code (viết hoa, ví dụ KE_TOAN)"
              rules={[{ required: true, message: "Bắt buộc" }]}
            >
              <Input placeholder="KE_TOAN" />
            </Form.Item>
          )}
          <Form.Item
            name="RoleName"
            label="Tên"
            rules={[{ required: true, message: "Bắt buộc" }]}
          >
            <Input placeholder="Kế toán" />
          </Form.Item>
          <Form.Item name="Description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Permissions per role */}
      <Modal
        open={permModal.open}
        title={`Quyền cho role: ${permModal.role?.RoleCode || ""}`}
        onCancel={() => setPermModal({ open: false, role: null })}
        onOk={savePerms}
        width={680}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="Tick các menu mà role này được truy cập. Permission key tự sinh từ menuConfig.js."
          style={{ marginBottom: 12 }}
        />
        <Tree
          checkable
          treeData={permTree}
          checkedKeys={permChecked}
          onCheck={(checked) =>
            setPermChecked(
              Array.isArray(checked) ? checked : checked?.checked || [],
            )
          }
          defaultExpandAll
          height={420}
        />
        <Text type="secondary">Đang chọn: {permChecked.length} key</Text>
      </Modal>

      {/* User → Roles modal đã chuyển sang /system/users */}
    </div>
  );
}
