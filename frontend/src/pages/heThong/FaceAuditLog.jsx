import {
  AuditOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Card,
  Col,
  Input,
  Row,
  Select,
  Statistic,
  Table,
  Tag,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

const ACTIONS = [
  { value: null, label: "Tất cả thao tác" },
  { value: "ENROLL", label: "Đăng ký" },
  { value: "IDENTIFY", label: "Nhận diện" },
  { value: "REVOKE", label: "Thu hồi" },
  { value: "VIEW", label: "Xem dữ liệu" },
  { value: "DELETE", label: "Xóa" },
];

const ACTION_COLOR = {
  ENROLL: "blue",
  IDENTIFY: "purple",
  REVOKE: "orange",
  VIEW: "default",
  DELETE: "red",
};

const RESULT_COLOR = {
  SUCCESS: "green",
  FAIL: "red",
  DENIED: "volcano",
};

/**
 * Audit log truy cập dữ liệu sinh trắc — Nghị định 13/2023 yêu cầu
 * "ghi audit log cho mọi hành vi truy cập dữ liệu khuôn mặt".
 *
 * Filter: số ngày, loại thao tác, mã y tế. Hiển thị bảng + tổng hợp.
 */
export default function FaceAuditLog() {
  const [days, setDays] = useState(7);
  const [action, setAction] = useState(null);
  const [maYTe, setMaYTe] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get("/face/audit-log", {
        days,
        ...(action ? { action } : {}),
        ...(maYTe.trim() ? { maYTe: maYTe.trim() } : {}),
        limit: 500,
      });
      setRows(res?.data || []);
    } catch (e) {
      message.error(e?.message || "Lỗi tải audit log");
    } finally {
      setLoading(false);
    }
  }, [days, action, maYTe]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const tally = { total: rows.length, success: 0, fail: 0, denied: 0 };
    for (const r of rows) {
      if (r.Result === "SUCCESS") tally.success++;
      else if (r.Result === "FAIL") tally.fail++;
      else if (r.Result === "DENIED") tally.denied++;
    }
    return tally;
  }, [rows]);

  const columns = [
    {
      title: "Lúc",
      dataIndex: "CreatedAt",
      key: "CreatedAt",
      width: 160,
      render: (v) => (v ? new Date(v).toLocaleString("vi-VN") : "—"),
    },
    {
      title: "Thao tác",
      dataIndex: "Action",
      key: "Action",
      width: 120,
      render: (v) => <Tag color={ACTION_COLOR[v] || "default"}>{v}</Tag>,
    },
    {
      title: "Kết quả",
      dataIndex: "Result",
      key: "Result",
      width: 110,
      render: (v) => <Tag color={RESULT_COLOR[v] || "default"}>{v}</Tag>,
    },
    { title: "Mã y tế", dataIndex: "MaYTe", key: "MaYTe", width: 130 },
    {
      title: "User",
      dataIndex: "UserId",
      key: "UserId",
      width: 80,
      render: (v) => v ?? "—",
    },
    {
      title: "Confidence",
      dataIndex: "Confidence",
      key: "Confidence",
      width: 110,
      render: (v) => (v != null ? Number(v).toFixed(3) : "—"),
    },
    { title: "Ghi chú", dataIndex: "Message", key: "Message", ellipsis: true },
    {
      title: "IP",
      dataIndex: "ClientIp",
      key: "ClientIp",
      width: 130,
      render: (v) => (v ? <code style={{ fontSize: 11 }}>{v}</code> : "—"),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        tone="audit"
        icon={<SafetyCertificateOutlined />}
        title="Audit log dữ liệu sinh trắc"
        subtitle="Mọi thao tác Enroll / Identify / Revoke / Xem dữ liệu khuôn mặt đều được ghi log theo Nghị định 13/2023 về dữ liệu cá nhân."
        extra={
          <PageHeader.Button
            type="primary"
            icon={<ReloadOutlined spin={loading} />}
            onClick={load}
            loading={loading}
          >
            Tải lại
          </PageHeader.Button>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="Tổng bản ghi" value={summary.total} prefix={<AuditOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Thành công"
              value={summary.success}
              valueStyle={{ color: "#389e0d" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Thất bại"
              value={summary.fail}
              valueStyle={{ color: "#cf1322" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Bị từ chối"
              value={summary.denied}
              valueStyle={{ color: "#fa541c" }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <div style={{ marginBottom: 4, fontSize: 12, color: "#6b7280" }}>Khoảng thời gian</div>
            <Select
              style={{ width: "100%" }}
              value={days}
              onChange={setDays}
              options={[
                { value: 1, label: "Hôm nay" },
                { value: 7, label: "7 ngày" },
                { value: 30, label: "30 ngày" },
                { value: 90, label: "90 ngày" },
              ]}
            />
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ marginBottom: 4, fontSize: 12, color: "#6b7280" }}>Loại thao tác</div>
            <Select
              style={{ width: "100%" }}
              value={action}
              onChange={setAction}
              options={ACTIONS}
            />
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ marginBottom: 4, fontSize: 12, color: "#6b7280" }}>Mã y tế</div>
            <Input.Search
              placeholder="VD: 210009394"
              value={maYTe}
              onChange={(e) => setMaYTe(e.target.value)}
              onSearch={load}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {summary.total === 0 && !loading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Chưa có audit log trong khoảng thời gian này"
          description="Audit log được tạo tự động khi có thao tác đăng ký, nhận diện, thu hồi hoặc xem danh sách khuôn mặt."
        />
      )}

      <Card>
        <Table
          rowKey="Id"
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 20, showTotal: (t) => `Tổng ${t} bản ghi` }}
        />
      </Card>
    </div>
  );
}
