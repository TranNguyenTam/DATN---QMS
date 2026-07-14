import { SafetyCertificateOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Empty, Input, List, Row, Spin, Table, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import http from "../../util/httpClient";
import PageHeader from "../../component/PageHeader";

const BASE = "/danh-muc/admin";

/**
 * Phân quyền User - Phòng ban - Hàng đợi (từ form PhanQuyenUserPhongBanHangDoi.cs).
 * Chọn user → load quyền hiện tại → tick các hàng đợi + phòng ban → Lưu
 * (DELETE cũ + INSERT mới theo đúng flow WinForms).
 */
export default function PhanQuyen() {
  const [users, setUsers] = useState([]);
  const [hangDoi, setHangDoi] = useState([]);
  const [phongBan, setPhongBan] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [checkedHdIds, setCheckedHdIds] = useState([]);
  const [checkedPbIds, setCheckedPbIds] = useState([]);
  const [loadingPerm, setLoadingPerm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, hd, pb] = await Promise.all([
          http.get(`${BASE}/cbb/users`),
          http.get(`${BASE}/cbb/hang-doi`),
          http.get(`${BASE}/cbb/hang-doi-phong-ban`),
        ]);
        setUsers(u?.data || []);
        setHangDoi(hd?.data || []);
        setPhongBan(pb?.data || []);
      } catch (e) {
        message.error({ key: "init-perm", content: "Không tải được dữ liệu phân quyền" });
      }
    })();
  }, []);

  const loadUserPermissions = useCallback(async (userId) => {
    setLoadingPerm(true);
    // Reset trước khi load để tránh hiển thị state cũ của user trước
    setCheckedHdIds([]);
    setCheckedPbIds([]);
    try {
      const res = await http.get(`${BASE}/phan-quyen/${userId}`);
      const data = res?.data || {};
      // hangDoi: BE trả full list 12 row có cờ checkHangDoi (0/1).
      // Chỉ tick những HD có checkHangDoi=1 (đã gán cho user).
      setCheckedHdIds(
        (data.hangDoi || [])
          .filter((r) => r.checkHangDoi === 1 || r.checkHangDoi === true)
          .map((r) => r.HangDoi_Id),
      );
      // phongBan: BE trả flat list các PB đã gán (không có cờ check).
      setCheckedPbIds((data.phongBan || []).map((r) => r.PhongBan_Id));
    } catch (e) {
      // key để toast không stack lên nhau khi user click nhiều
      message.error({ key: "load-perm", content: "Không tải được quyền của user" });
    } finally {
      setLoadingPerm(false);
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
      const res = await http.post(`${BASE}/phan-quyen`, {
        userId: selectedUserId,
        hangDoiIds: checkedHdIds,
        phongBanIds: checkedPbIds,
      });
      if (res?.data?.ok) message.success(res.data.message);
      else message.error(res?.data?.message || "Lưu thất bại");
    } catch (e) {
      message.error(e?.message || "Lỗi lưu phân quyền");
    } finally {
      setSaving(false);
    }
  };

  // SP_003 CBBUsers trả { FieldCode = User_Id, FieldName = UserCode, UserName }.
  // Normalize về { userId, userCode, userName } để render không phụ thuộc
  // tên cột thô (tránh undefined → GET /phan-quyen/undefined → 404).
  const normUsers = useMemo(
    () =>
      (users || []).map((u) => ({
        userId: u.FieldCode ?? u.User_Id,
        userCode: u.FieldName ?? u.UserCode,
        userName: u.UserName,
      })),
    [users],
  );

  // CBBHangDoi trả { FieldCode = HangDoi_Id, FieldName = TenHangDoi }.
  // CBBHangDoiPhongBan trả { FieldCode = PhongBan_Id, FieldName = TenPhongBan }.
  // Normalize về Id thật → rowKey unique (nếu không mọi row cùng key
  // undefined → tick 1 row = tick toàn bộ table).
  const normHangDoi = useMemo(
    () =>
      (hangDoi || []).map((h) => ({
        HangDoi_Id: h.FieldCode ?? h.HangDoi_Id,
        TenHangDoi: h.FieldName ?? h.TenHangDoi,
      })),
    [hangDoi],
  );
  const normPhongBan = useMemo(
    () =>
      (phongBan || []).map((p) => ({
        PhongBan_Id: p.FieldCode ?? p.PhongBan_Id,
        TenPhongBan: p.FieldName ?? p.TenPhongBan,
      })),
    [phongBan],
  );

  const filteredUsers = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return normUsers;
    return normUsers.filter(
      (u) =>
        (u.userCode || "").toLowerCase().includes(kw) ||
        (u.userName || "").toLowerCase().includes(kw),
    );
  }, [normUsers, search]);

  const hdColumns = [
    { title: "Tên hàng đợi", dataIndex: "TenHangDoi", render: (v) => v || "—" },
  ];
  const pbColumns = [
    { title: "Tên phòng ban", dataIndex: "TenPhongBan", render: (v) => v || "—" },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<SafetyCertificateOutlined />}
        title="Phân quyền User – Phòng / Hàng đợi"
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
                  key={u.userId}
                  onClick={() => selectUser(u.userId)}
                  style={{
                    cursor: "pointer",
                    padding: "10px 16px",
                    background: selectedUserId === u.userId ? "#e6f4ff" : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.userName || u.userCode}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{u.userCode}</div>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: <Empty description="Không có user" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} md={16}>
          {!selectedUserId ? (
            <Alert
              type="info"
              showIcon
              message="Chọn một người dùng, sau đó tick các phòng ban và hàng đợi cần cấp quyền."
            />
          ) : loadingPerm ? (
            <Spin />
          ) : (
            <>
              <Card title="Phòng ban được gán" style={{ marginBottom: 12 }}>
                <Table
                  size="small"
                  rowKey="PhongBan_Id"
                  dataSource={normPhongBan}
                  columns={pbColumns}
                  pagination={{ pageSize: 8 }}
                  rowSelection={{
                    selectedRowKeys: checkedPbIds,
                    onChange: (keys) => setCheckedPbIds(keys),
                  }}
                />
              </Card>
              <Card title="Hàng đợi được gán">
                <Table
                  size="small"
                  rowKey="HangDoi_Id"
                  dataSource={normHangDoi}
                  columns={hdColumns}
                  pagination={{ pageSize: 10 }}
                  rowSelection={{
                    selectedRowKeys: checkedHdIds,
                    onChange: (keys) => setCheckedHdIds(keys),
                  }}
                />
              </Card>
            </>
          )}
        </Col>
      </Row>
    </div>
  );
}
