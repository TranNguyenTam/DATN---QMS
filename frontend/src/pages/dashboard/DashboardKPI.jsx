import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  HourglassOutlined,
  PhoneOutlined,
  ReloadOutlined,
  SmileOutlined,
  TeamOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Column, Pie } from "@ant-design/plots";
import StatCard from "../../component/StatCard";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  notification,
  Row,
  Statistic,
  Table,
  Tag,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSocket } from "../../hooks/useSocket";
import http from "../../util/httpClient";

/**
 * Dashboard KPI vận hành — KPI thời gian thực hôm nay (auto-refresh 30s):
 *   /summary, /throughput, /queue-status, /overload, /face-stats.
 * Phần "Phân tích vận hành theo khoảng ngày" đã tách sang trang riêng
 * (Dashboard ▸ Phân tích vận hành — PhanTichVanHanh.jsx).
 */
export default function DashboardKPI() {
  const [date, setDate] = useState(() => dayjs());
  const [summary, setSummary] = useState(null);
  const [throughput, setThroughput] = useState([]);
  const [queueStatus, setQueueStatus] = useState([]);
  const [overload, setOverload] = useState([]);
  const [faceStats, setFaceStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date: date.format("YYYY-MM-DD") };
      const [s, t, q, o, f] = await Promise.all([
        http.get("/dashboard/summary", params),
        http.get("/dashboard/throughput", params),
        http.get("/dashboard/queue-status"),
        http.get("/dashboard/overload", { threshold: 10 }),
        http.get("/dashboard/face-stats", params),
      ]);
      setSummary(s?.data);
      setThroughput(t?.data || []);
      setQueueStatus(q?.data || []);
      setOverload(o?.data?.overloaded || []);
      setFaceStats(f?.data);
      setLastUpdated(dayjs());
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Subscribe realtime overload alert — backend push khi tập hàng đợi quá tải đổi.
  const { isConnected, subscribe } = useSocket();
  useEffect(() => {
    if (!isConnected) return undefined;
    const __sub = subscribe("/topic/overload-alert", (payload) => {
      const list = payload?.overloaded || [];
      setOverload(list);
      if (list.length > 0) {
        notification.warning({
          message: `Cảnh báo quá tải (≥ ${payload.threshold} BN)`,
          description: `${list.length} hàng đợi đang vượt ngưỡng. Cần điều phối thêm quầy.`,
          placement: "topRight",
          duration: 5,
        });
      }
    });
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe]);

  const queuePieData = useMemo(
    () =>
      (queueStatus || []).slice(0, 8).map((q) => ({
        label: `HĐ ${q.hangDoiId}${q.phongBanId ? ` · PB ${q.phongBanId}` : ""}`,
        waiting: q.waiting,
      })),
    [queueStatus],
  );

  const statCards = [
    {
      title: "Tổng bệnh nhân",
      value: summary?.total ?? 0,
      icon: <TeamOutlined />,
      accent: "#1677ff",
    },
    {
      title: "Đang chờ",
      value: summary?.waiting ?? 0,
      icon: <HourglassOutlined />,
      accent: "#faad14",
    },
    {
      title: "Đã gọi",
      value: summary?.called ?? 0,
      icon: <PhoneOutlined />,
      accent: "#1677ff",
    },
    {
      title: "Hoàn tất",
      value: summary?.completed ?? 0,
      icon: <CheckCircleOutlined />,
      accent: "#52c41a",
    },
    {
      title: "Quầy hoạt động",
      value: summary?.activeCounters ?? 0,
      icon: <SmileOutlined />,
      accent: "#003a8c",
    },
    {
      title: "TG phục vụ TB (phút)",
      value: summary?.avgServeMinutes ?? 0,
      icon: <ClockCircleOutlined />,
      precision: 1,
      accent: "#475569",
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* Header banner gradient */}
      <div
        style={{
          background: "linear-gradient(135deg, #1677ff 0%, #003a8c 100%)",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 16,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          boxShadow: "0 4px 14px rgba(22, 119, 255, 0.25)",
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ color: "#fff", margin: 0, fontSize: 24 }}>
            Dashboard KPI vận hành
          </h2>
          <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
            Theo dõi thời gian thực hàng đợi, thông lượng và nhận diện khuôn mặt.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <CalendarOutlined style={{ color: "#fff" }} />
          <DatePicker
            allowClear={false}
            value={date}
            onChange={setDate}
            format="DD/MM/YYYY"
          />
          <Button
            type="primary"
            icon={<ReloadOutlined spin={loading} />}
            onClick={load}
            loading={loading}
            style={{ background: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.3)" }}
          >
            Tải lại
          </Button>
        </div>
        {lastUpdated && (
          <div style={{ width: "100%", fontSize: 11, opacity: 0.8 }}>
            Cập nhật: {lastUpdated.format("HH:mm:ss")} · auto-refresh 30s
          </div>
        )}
      </div>

      {overload.length > 0 && (
        <Alert
          icon={<WarningOutlined />}
          style={{ marginBottom: 16, borderRadius: 12 }}
          type="warning"
          showIcon
          message={`Có ${overload.length} hàng đợi đang quá tải (≥ 10 BN chờ)`}
          description={
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {overload.map((o) => (
                <Tag key={`${o.hangDoiId}-${o.phongBanId}`} color="red">
                  Hàng đợi {o.hangDoiId}
                  {o.phongBanId ? ` · Phòng ${o.phongBanId}` : ""}:{" "}
                  {o.waiting} BN
                </Tag>
              ))}
            </div>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        {statCards.map((c) => (
          <Col xs={12} sm={8} md={4} key={c.title}>
            <StatCard
              title={c.title}
              value={c.value}
              icon={c.icon}
              accent={c.accent}
              precision={c.precision}
            />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Phân bố bệnh nhân theo giờ">
            {throughput.length === 0 ? (
              <Empty description="Chưa có dữ liệu trong ngày" />
            ) : (
              <Column
                autoFit
                height={280}
                data={throughput.flatMap((t) => [
                  { hour: `${String(t.hour).padStart(2, "0")}h`, loai: "Phát số", value: t.issued },
                  { hour: `${String(t.hour).padStart(2, "0")}h`, loai: "Hoàn tất", value: t.completed },
                ])}
                xField="hour"
                yField="value"
                colorField="loai"
                group
                color={["#1677ff", "#52c41a"]}
                axis={{ y: { title: "Số bệnh nhân" } }}
                legend={{ color: { position: "top" } }}
                tooltip={{ title: "Giờ" }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Chờ trung bình theo giờ (phút)">
            {throughput.length === 0 ? (
              <Empty description="Chưa có dữ liệu trong ngày" />
            ) : (
              <Column
                autoFit
                height={280}
                data={throughput.map((t) => ({
                  hour: `${String(t.hour).padStart(2, "0")}h`,
                  minutes: t.avgWaitMinutes || 0,
                }))}
                xField="hour"
                yField="minutes"
                color="#1677ff"
                axis={{ y: { title: "Phút" } }}
                columnStyle={{ radiusTopLeft: 4, radiusTopRight: 4 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Phân bố hàng đợi đang chờ">
            {queuePieData.length === 0 ? (
              <Empty description="Không có hàng đợi đang chờ" />
            ) : (
              <Pie
                autoFit
                height={280}
                data={queuePieData}
                angleField="waiting"
                colorField="label"
                radius={0.85}
                innerRadius={0.5}
                label={{
                  position: "outside",
                  text: (d) => `${d.label}: ${d.waiting}`,
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Chi tiết hàng đợi đang chờ">
            <Table
              size="small"
              rowKey={(r) => `${r.hangDoiId}-${r.phongBanId}`}
              dataSource={queueStatus}
              pagination={{ pageSize: 8 }}
              columns={[
                { title: "Hàng đợi", dataIndex: "hangDoiId", render: (v) => v ?? "—" },
                { title: "Phòng ban", dataIndex: "phongBanId", render: (v) => v ?? "—" },
                {
                  title: "Số BN chờ",
                  dataIndex: "waiting",
                  render: (n) => (
                    <Tag color={n >= 10 ? "red" : n >= 5 ? "orange" : "green"}>{n}</Tag>
                  ),
                },
                {
                  title: "BN chờ lâu nhất từ",
                  dataIndex: "oldestTakeAt",
                  render: (v) => (v ? new Date(v).toLocaleTimeString("vi-VN") : "—"),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={16}>
          <Card title="Nhận diện khuôn mặt — hôm nay">
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Statistic title="Đã đăng ký" value={faceStats?.enrolledActive ?? 0} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Nhận diện OK"
                  value={faceStats?.identifySuccess ?? 0}
                  valueStyle={{ color: "var(--color-success)" }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Thất bại"
                  value={faceStats?.identifyFail ?? 0}
                  valueStyle={{ color: "var(--color-error)" }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Confidence TB"
                  value={faceStats?.avgConfidence ?? 0}
                  precision={3}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Tỷ lệ nhận diện">
            {faceStats && (faceStats.identifySuccess + faceStats.identifyFail) > 0 ? (
              <Pie
                autoFit
                height={220}
                data={[
                  { label: "Thành công", value: faceStats.identifySuccess || 0 },
                  { label: "Thất bại", value: faceStats.identifyFail || 0 },
                ]}
                angleField="value"
                colorField="label"
                radius={0.9}
                innerRadius={0.6}
                scale={{ color: { range: ["#52c41a", "#ff4d4f"] } }}
                label={{ position: "outside", text: (d) => `${d.label}: ${d.value}` }}
              />
            ) : (
              <Empty description="Chưa có lượt nhận diện" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
