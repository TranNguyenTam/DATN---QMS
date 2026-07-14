import { ApartmentOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Empty, Input, List, Row, Spin, Tree, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

const BASE = "/system/permission-menu";

/**
 * Phân quyền Menu — tương đương form `HeThong/PhanQuyenMenu.cs`.
 * UI: bên trái danh sách user, bên phải TreeView menu có checkbox.
 * Save: DELETE quyền cũ + INSERT danh sách checked.
 */
export default function PhanQuyenMenu() {
  const [users, setUsers] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, m] = await Promise.all([
          http.get(`${BASE}/users`),
          http.get(`${BASE}/menus`),
        ]);
        setUsers(u?.data || []);
        setMenus(m?.data || []);
      } catch (e) {
        message.error("Không tải được dữ liệu phân quyền");
      }
    })();
  }, []);

  // Build tree: tìm các node không có parent hoặc ParentMenu==0 làm root.
  const treeData = useMemo(() => {
    if (!menus.length) return [];
    const byParent = new Map();
    menus.forEach((m) => {
      const pid = m.ParentMenu || 0;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(m);
    });
    const build = (pid) =>
      (byParent.get(pid) || []).map((m) => ({
        title: m.MenuName || m.MenuCode,
        key: m.Menu_Id,
        children: build(m.Menu_Id),
      }));
    return build(0);
  }, [menus]);

  const loadUserPermissions = useCallback(async (userId) => {
    setLoadingMenus(true);
    try {
      const res = await http.get(`${BASE}/user/${userId}`);
      const list = res?.data || [];
      setCheckedKeys(list.map((r) => r.Menu_Id));
    } catch (e) {
      message.error("Không tải được quyền của user");
    } finally {
      setLoadingMenus(false);
    }
  }, []);

  const selectUser = (userId) => {
    setSelectedUserId(userId);
    loadUserPermissions(userId);
  };

  const save = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await http.post(BASE, {
        userId: selectedUserId,
        menuIds: checkedKeys,
      });
      if (res?.data?.ok) message.success(res.data.message);
      else message.error(res?.data?.message || "Lưu thất bại");
    } catch (e) {
      message.error(e?.message || "Lỗi lưu phân quyền");
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return users;
    return users.filter(
      (u) =>
        (u.UserCode || "").toLowerCase().includes(kw) ||
        (u.UserName || "").toLowerCase().includes(kw),
    );
  }, [users, search]);

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<ApartmentOutlined />}
        title="Phân quyền menu"
        extra={
          <PageHeader.Button
            icon={<SaveOutlined />}
            disabled={!selectedUserId}
            loading={saving}
            onClick={save}
          >
            Lưu phân quyền
          </PageHeader.Button>
        }
      />

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Card title="Người dùng" bodyStyle={{ padding: 0 }}>
            <div style={{ padding: 12, borderBottom: "1px solid #f0f0f0" }}>
              <Input.Search
                placeholder="Tìm người dùng"
                allowClear
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <List
              dataSource={filteredUsers}
              style={{ maxHeight: "65vh", overflowY: "auto" }}
              renderItem={(u) => (
                <List.Item
                  onClick={() => selectUser(u.User_Id)}
                  style={{
                    cursor: "pointer",
                    padding: "10px 16px",
                    background: selectedUserId === u.User_Id ? "#e6f4ff" : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.UserName || u.UserCode}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{u.UserCode}</div>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: <Empty description="Không có user" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card title={selectedUserId ? `Menu được gán (${checkedKeys.length})` : "Chọn một user ở bên trái"}>
            {!selectedUserId ? (
              <Alert
                type="info"
                showIcon
                message="Chọn một người dùng, sau đó tick các menu muốn cấp quyền. Bấm Lưu phân quyền để áp dụng."
              />
            ) : loadingMenus ? (
              <Spin />
            ) : (
              <Tree
                checkable
                defaultExpandAll
                checkedKeys={checkedKeys}
                onCheck={(keys) => setCheckedKeys(Array.isArray(keys) ? keys : keys.checked)}
                treeData={treeData}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
