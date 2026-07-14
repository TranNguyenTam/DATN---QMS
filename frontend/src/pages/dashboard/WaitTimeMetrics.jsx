import {
  ExperimentOutlined,
  LineChartOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Line } from "@ant-design/plots";
import {
  Alert,
  Card,
  Col,
  Empty,
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

/**
 * Trang đo lường mô-đun dự báo thời gian chờ.
 *
 * - MAE/RMSE/MAPE/over10min từ /wait-time-metrics/metrics
 * - Sync actual: nút gọi POST /wait-time-metrics/sync-actual
 * - Bảng log gần nhất + biểu đồ predicted vs actual theo thời gian
 */
export default function WaitTimeMetrics() {
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [comparedLogs, setComparedLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, l, c] = await Promise.all([
        http.get("/wait-time-metrics/metrics", { days }),
        http.get("/wait-time-metrics/logs", { limit: 200 }),
        http.get("/wait-time-metrics/logs", { limit: 50, onlyActual: true }),
      ]);
      setMetrics(m?.data || null);
      setLogs(l?.data || []);
      setComparedLogs(c?.data || []);
    } catch (e) {
      message.error(e?.message || "Lỗi tải metrics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await http.post("/wait-time-metrics/sync-actual");
      if (res?.data?.ok) {
        message.success(`Đã cập nhật ActualMinutes cho ${res.data.updated} bản ghi`);
        await load();
      } else {
        message.error(res?.data?.message || "Sync thất bại");
      }
    } catch (e) {
      message.error(e?.message || "Lỗi sync");
    } finally {
      setSyncing(false);
    }
  };

  // Biểu đồ lấy các log ĐÃ CÓ actual (comparedLogs) — không phụ thuộc "N mới nhất"
  // (vốn toàn dự báo BN đang chờ, chưa có actual).
  const chartData = useMemo(() => {
    return comparedLogs
      .filter((r) => r.PredictedMinutesRule != null && r.ActualMinutes != null)
      .slice(0, 50)
      .reverse()
      .flatMap((r, i) => [
        { idx: i + 1, type: "Dự báo (rule)", value: r.PredictedMinutesRule },
        { idx: i + 1, type: "Thực tế", value: r.ActualMinutes },
      ]);
  }, [logs]);

  const samples = metrics?.samples ?? 0;

  const fmt = (v, p = 2) =>
    v == null || isNaN(v) ? "—" : Number(v).toFixed(p);

  const columns = [
    { title: "ID", dataIndex: "Id", width: 70 },
    { title: "Hàng đợi", dataIndex: "HangDoi_Id", width: 90 },
    { title: "Queue len", dataIndex: "QueueLen", width: 100 },
    {
      title: "Pred rule",
      dataIndex: "PredictedMinutesRule",
      width: 110,
      render: (v) => (v != null ? <Tag color="blue">{Number(v).toFixed(1)} ph</Tag> : "—"),
    },
    {
      title: "Pred ML",
      dataIndex: "PredictedMinutesMl",
      width: 110,
      render: (v) => (v != null ? <Tag color="purple">{Number(v).toFixed(1)} ph</Tag> : "—"),
    },
    {
      title: "Confidence",
      dataIndex: "MlConfidence",
      width: 110,
      render: (v) => (v != null ? Number(v).toFixed(3) : "—"),
    },
    { title: "Method", dataIndex: "MethodUsed", width: 130 },
    {
      title: "Actual",
      dataIndex: "ActualMinutes",
      width: 110,
      render: (v) => (v != null ? <Tag color="green">{Number(v).toFixed(1)} ph</Tag> : <Tag>chờ sync</Tag>),
    },
    {
      title: "Sai số",
      key: "err",
      width: 100,
      render: (_, r) =>
        r.ActualMinutes == null || r.PredictedMinutesRule == null
          ? "—"
          : <Tag color={Math.abs(r.PredictedMinutesRule - r.ActualMinutes) > 10 ? "red" : "default"}>
              {Math.abs(r.PredictedMinutesRule - r.ActualMinutes).toFixed(1)}
            </Tag>,
    },
    {
      title: "Tạo lúc",
      dataIndex: "CreatedAt",
      width: 160,
      render: (v) => (v ? new Date(v).toLocaleString("vi-VN") : "—"),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        tone="metrics"
        icon={<ExperimentOutlined />}
        title="Đo lường dự báo thời gian chờ"
        subtitle="MAE / RMSE / MAPE giữa dự báo và thực tế. Dùng để đánh giá độ chính xác mô-đun rule-based + ML."
        extra={
          <>
            <Select
              value={days}
              onChange={setDays}
              style={{ width: 160 }}
              options={[
                { value: 1, label: "Hôm nay" },
                { value: 7, label: "7 ngày gần nhất" },
                { value: 30, label: "30 ngày gần nhất" },
                { value: 90, label: "90 ngày" },
              ]}
            />
            <PageHeader.Button
              icon={<SyncOutlined spin={syncing} />}
              onClick={handleSync}
              loading={syncing}
            >
              Sync ActualMinutes
            </PageHeader.Button>
            <PageHeader.Button
              type="primary"
              icon={<ReloadOutlined spin={loading} />}
              onClick={load}
              loading={loading}
            >
              Tải lại
            </PageHeader.Button>
          </>
        }
      />

      {samples === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Chưa có dữ liệu đo lường"
          description={
            <>
              Để có dữ liệu: (1) hệ thống cần được dùng vài lần để có lượt dự báo
              trong <code>WaitEstimateLog</code>, (2) bấm <strong>Sync ActualMinutes</strong> để
              cập nhật thực tế từ <code>HangDoiPhongBan</code>. Quá trình này
              chạy được sau khi BN hoàn tất ở các quầy.
            </>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Số mẫu đã đo"
              value={samples}
              prefix={<LineChartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="MAE (phút)"
              value={fmt(metrics?.mae)}
              valueStyle={{ color: "var(--color-primary)" }}
            />
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Mean Absolute Error</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="RMSE (phút)"
              value={fmt(metrics?.rmse)}
              valueStyle={{ color: "var(--color-primary)" }}
            />
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Root Mean Square Error</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="MAPE (%)"
              value={fmt(metrics?.mape)}
              valueStyle={{ color: "var(--color-primary)" }}
            />
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Mean Abs Percentage Err</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Tỉ lệ lệch > 10 phút"
              value={fmt(metrics?.over10minPct, 1)}
              suffix="%"
              valueStyle={{
                color: metrics?.over10minPct > 30 ? "#cf1322" : "#389e0d",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
              Càng thấp càng tốt; nghiệm thu lý tưởng &lt; 20%.
            </div>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card title="Predicted (rule) vs Actual — 50 lượt gần nhất">
            {chartData.length === 0 ? (
              <Empty description="Chưa có dữ liệu so sánh" />
            ) : (
              <Line
                autoFit
                height={240}
                data={chartData}
                xField="idx"
                yField="value"
                colorField="type"
                seriesField="type"
                point={{ size: 3 }}
                smooth
                color={["#1677ff", "#52c41a"]}
                axis={{
                  x: { title: "Lượt thứ" },
                  y: { title: "Phút" },
                }}
                legend={{ color: { position: "top" } }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Log gần nhất (200 dòng)" style={{ marginTop: 16 }}>
        <Table
          rowKey="Id"
          size="small"
          dataSource={logs}
          columns={columns}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  );
}
