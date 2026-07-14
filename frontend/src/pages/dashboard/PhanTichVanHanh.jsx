import {
  AreaChartOutlined,
  BarChartOutlined,
  CalendarOutlined,
  FireOutlined,
  FundOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Column, Line } from "@ant-design/plots";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Progress,
  Row,
  Select,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from "antd";
import dayjs from "dayjs";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import http from "../../util/httpClient";

// Nhãn cố định cho phần "Phân tích vận hành".
const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const BUCKET_LABELS = {
  1: "< 5",
  2: "5–10",
  3: "10–15",
  4: "15–20",
  5: "20–30",
  6: "≥ 30",
};

/**
 * Heatmap giờ cao điểm — lưới (thứ × giờ) tô đậm theo số BN.
 */
function OperationalHeatmap({ data }) {
  const { grid, hours, max } = useMemo(() => {
    const map = new Map();
    const hourSet = new Set();
    let mx = 0;
    for (const d of data || []) {
      const dow = Number(d.dow);
      const gio = Number(d.gio);
      const v = Number(d.soBN) || 0;
      map.set(`${dow}-${gio}`, v);
      hourSet.add(gio);
      if (v > mx) mx = v;
    }
    let hrs = [...hourSet].sort((a, b) => a - b);
    if (hrs.length === 0) hrs = Array.from({ length: 12 }, (_, i) => i + 6);
    return { grid: map, hours: hrs, max: mx };
  }, [data]);

  if (!data || data.length === 0) {
    return <Empty description="Chưa có dữ liệu trong khoảng đã chọn" />;
  }

  const cellColor = (v) => {
    if (!v) return "#f4f6fa";
    const ratio = max > 0 ? v / max : 0;
    const alpha = 0.12 + 0.88 * ratio;
    return `rgba(22, 119, 255, ${alpha.toFixed(3)})`;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `44px repeat(${hours.length}, minmax(32px, 1fr))`,
          gap: 3,
          minWidth: 520,
        }}
      >
        <div />
        {hours.map((h) => (
          <div
            key={`h-${h}`}
            style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}
          >
            {h}h
          </div>
        ))}
        {DOW_LABELS.map((label, dow) => (
          <Fragment key={`row-${dow}`}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 12,
                color: "var(--color-text-secondary)",
                fontWeight: 600,
              }}
            >
              {label}
            </div>
            {hours.map((h) => {
              const v = grid.get(`${dow}-${h}`) || 0;
              return (
                <Tooltip key={`c-${dow}-${h}`} title={`${label} · ${h}h: ${v} BN`}>
                  <div
                    style={{
                      height: 30,
                      borderRadius: 4,
                      background: cellColor(v),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: v > max * 0.6 ? "#fff" : "#334155",
                      cursor: "default",
                    }}
                  >
                    {v || ""}
                  </div>
                </Tooltip>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          fontSize: 11,
          color: "var(--color-text-secondary)",
        }}
      >
        <span>Ít</span>
        <div style={{ display: "flex", gap: 2 }}>
          {[0.12, 0.3, 0.5, 0.7, 0.9, 1].map((a) => (
            <div
              key={a}
              style={{ width: 18, height: 12, borderRadius: 2, background: `rgba(22,119,255,${a})` }}
            />
          ))}
        </div>
        <span>Nhiều</span>
        <span style={{ marginLeft: "auto" }}>Cao điểm: {max} BN/giờ</span>
      </div>
    </div>
  );
}

/**
 * Phân tích vận hành theo khoảng ngày (lịch sử) — tách từ Dashboard KPI thành
 * danh mục Dashboard riêng. Chỉ UI/cấu trúc, API giữ nguyên:
 *   /dashboard/analytics/throughput-daily, /heatmap, /queue-performance, /wait-distribution.
 */
export default function PhanTichVanHanh() {
  const [range, setRange] = useState(() => [dayjs().subtract(6, "day"), dayjs()]);
  const [waitThreshold, setWaitThreshold] = useState(15);
  const [daily, setDaily] = useState([]);
  const [heat, setHeat] = useState([]);
  const [queuePerf, setQueuePerf] = useState([]);
  const [waitDist, setWaitDist] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const loadAnalytics = useCallback(async () => {
    if (!range?.[0] || !range?.[1]) return;
    setLoadingAnalytics(true);
    try {
      const params = {
        from: range[0].format("YYYY-MM-DD"),
        to: range[1].format("YYYY-MM-DD"),
      };
      const [d, h, qp, wd] = await Promise.all([
        http.get("/dashboard/analytics/throughput-daily", params),
        http.get("/dashboard/analytics/heatmap", params),
        http.get("/dashboard/analytics/queue-performance", params),
        http.get("/dashboard/analytics/wait-distribution", { ...params, threshold: waitThreshold }),
      ]);
      setDaily(d?.data || []);
      setHeat(h?.data || []);
      setQueuePerf(qp?.data || []);
      setWaitDist(wd?.data || null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [range, waitThreshold]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const dailyBarData = useMemo(
    () =>
      (daily || []).flatMap((r) => [
        { ngay: dayjs(r.ngay).format("DD/MM"), loai: "Phát số", value: r.issued || 0 },
        { ngay: dayjs(r.ngay).format("DD/MM"), loai: "Hoàn tất", value: r.completed || 0 },
      ]),
    [daily],
  );
  const dailyWaitData = useMemo(
    () =>
      (daily || []).map((r) => ({
        ngay: dayjs(r.ngay).format("DD/MM"),
        minutes: r.avgWaitMinutes || 0,
      })),
    [daily],
  );
  const waitBucketData = useMemo(
    () =>
      (waitDist?.buckets || []).map((b) => ({
        bucket: BUCKET_LABELS[b.bucketOrder] || String(b.bucketOrder),
        value: b.soBN || 0,
      })),
    [waitDist],
  );
  const queueChartData = useMemo(
    () =>
      (queuePerf || [])
        .filter((q) => (q.avgWaitMinutes || 0) > 0)
        .slice()
        .sort((a, b) => (b.avgWaitMinutes || 0) - (a.avgWaitMinutes || 0))
        .slice(0, 12)
        .map((q) => ({
          name: q.tenPhongBan || q.tenHangDoi || `HĐ ${q.hangDoiId ?? "?"}`,
          minutes: q.avgWaitMinutes || 0,
        })),
    [queuePerf],
  );

  return (
    <div style={{ padding: 16 }}>
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
            <FundOutlined style={{ marginRight: 8 }} />
            Phân tích vận hành
          </h2>
          <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
            Xu hướng thông lượng, giờ cao điểm, hiệu suất từng hàng đợi và phân bố thời gian chờ theo khoảng ngày.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <CalendarOutlined style={{ color: "#fff" }} />
          <DatePicker.RangePicker
            allowClear={false}
            value={range}
            onChange={(v) => v && setRange(v)}
            format="DD/MM/YYYY"
            maxDate={dayjs()}
            presets={[
              { label: "7 ngày", value: [dayjs().subtract(6, "day"), dayjs()] },
              { label: "14 ngày", value: [dayjs().subtract(13, "day"), dayjs()] },
              { label: "30 ngày", value: [dayjs().subtract(29, "day"), dayjs()] },
              { label: "90 ngày", value: [dayjs().subtract(89, "day"), dayjs()] },
            ]}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined spin={loadingAnalytics} />}
            onClick={loadAnalytics}
            loading={loadingAnalytics}
            style={{ background: "rgba(255,255,255,0.2)", borderColor: "rgba(255,255,255,0.3)" }}
          >
            Tải lại
          </Button>
        </div>
      </div>

      {/* Xu hướng thông lượng + chờ TB theo ngày */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={
              <>
                <BarChartOutlined /> Xu hướng thông lượng theo ngày
              </>
            }
          >
            {dailyBarData.length === 0 ? (
              <Empty description="Chưa có dữ liệu" />
            ) : (
              <Column
                autoFit
                height={300}
                data={dailyBarData}
                xField="ngay"
                yField="value"
                colorField="loai"
                group
                color={["#1677ff", "#52c41a"]}
                axis={{ y: { title: "Số bệnh nhân" } }}
                legend={{ color: { position: "top" } }}
                tooltip={{ title: "Ngày" }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={
              <>
                <AreaChartOutlined /> Thời gian chờ trung bình theo ngày
              </>
            }
          >
            {dailyWaitData.length === 0 ? (
              <Empty description="Chưa có dữ liệu" />
            ) : (
              <Line
                autoFit
                height={300}
                data={dailyWaitData}
                xField="ngay"
                yField="minutes"
                color="#1677ff"
                point={{ size: 3 }}
                smooth
                axis={{ y: { title: "Phút" } }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Heatmap giờ cao điểm */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={
              <>
                <FireOutlined style={{ color: "#fa541c" }} /> Khung giờ cao điểm (số BN theo giờ × thứ trong tuần)
              </>
            }
            loading={loadingAnalytics && heat.length === 0}
          >
            <OperationalHeatmap data={heat} />
          </Card>
        </Col>
      </Row>

      {/* Phân bố thời gian chờ */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="Phân bố thời gian chờ (phút)">
            {waitBucketData.length === 0 ? (
              <Empty description="Chưa có lượt có thời gian chờ" />
            ) : (
              <Column
                autoFit
                height={280}
                data={waitBucketData}
                xField="bucket"
                yField="value"
                color="#1677ff"
                axis={{ x: { title: "Khoảng chờ (phút)" }, y: { title: "Số bệnh nhân" } }}
                columnStyle={{ radiusTopLeft: 4, radiusTopRight: 4 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Tổng quan thời gian chờ">
            <Row gutter={[12, 16]}>
              <Col span={12}>
                <Statistic title="Tổng lượt (có chờ)" value={waitDist?.total ?? 0} />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Chờ trung bình"
                  value={waitDist?.avgWaitMinutes ?? 0}
                  precision={1}
                  suffix="phút"
                  valueStyle={{ color: "var(--color-primary)" }}
                />
              </Col>
              <Col span={24}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    Ngưỡng cảnh báo
                  </span>
                  <Select
                    size="small"
                    value={waitThreshold}
                    onChange={setWaitThreshold}
                    style={{ width: 120 }}
                    options={[10, 15, 20, 30].map((v) => ({ value: v, label: `> ${v} phút` }))}
                  />
                </div>
                <Statistic
                  title={`Tỷ lệ chờ quá ${waitDist?.threshold ?? waitThreshold} phút`}
                  value={waitDist?.overThresholdPct ?? 0}
                  precision={1}
                  suffix="%"
                  valueStyle={{
                    color:
                      (waitDist?.overThresholdPct ?? 0) > 30
                        ? "var(--color-error)"
                        : "var(--color-success)",
                  }}
                />
                <Progress
                  percent={Math.min(100, waitDist?.overThresholdPct ?? 0)}
                  showInfo={false}
                  strokeColor={
                    (waitDist?.overThresholdPct ?? 0) > 30
                      ? "var(--color-error)"
                      : "var(--color-success)"
                  }
                />
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {waitDist?.overThreshold ?? 0} / {waitDist?.total ?? 0} lượt vượt ngưỡng.
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* So sánh hiệu suất hàng đợi / phòng ban */}
      <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 8 }}>
        <Col xs={24} lg={14}>
          <Card title="So sánh hiệu suất hàng đợi / phòng ban">
            <Table
              size="small"
              rowKey={(r) => `${r.hangDoiId}-${r.phongBanId}`}
              dataSource={queuePerf}
              loading={loadingAnalytics}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 720 }}
              columns={[
                {
                  title: "Phòng / Hàng đợi",
                  key: "ten",
                  render: (_, r) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {r.tenPhongBan || r.tenHangDoi || `HĐ ${r.hangDoiId ?? "?"}`}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {r.tenHangDoi || `HĐ ${r.hangDoiId ?? "?"}`}
                        {r.phongBanId ? ` · PB ${r.phongBanId}` : ""}
                      </div>
                    </div>
                  ),
                },
                {
                  title: "Lượt",
                  dataIndex: "issued",
                  width: 80,
                  sorter: (a, b) => (a.issued || 0) - (b.issued || 0),
                  defaultSortOrder: "descend",
                  render: (v) => (v || 0).toLocaleString("vi-VN"),
                },
                {
                  title: "Chờ TB",
                  dataIndex: "avgWaitMinutes",
                  width: 100,
                  sorter: (a, b) => (a.avgWaitMinutes || 0) - (b.avgWaitMinutes || 0),
                  render: (v) => (
                    <Tag color={v >= 20 ? "red" : v >= 10 ? "orange" : "green"}>{v ?? 0} ph</Tag>
                  ),
                },
                {
                  title: "Phục vụ TB",
                  dataIndex: "avgServeMinutes",
                  width: 105,
                  sorter: (a, b) => (a.avgServeMinutes || 0) - (b.avgServeMinutes || 0),
                  render: (v) => `${v ?? 0} ph`,
                },
                {
                  title: "Hoàn tất",
                  dataIndex: "completionRate",
                  width: 130,
                  sorter: (a, b) => (a.completionRate || 0) - (b.completionRate || 0),
                  render: (v) => <Progress percent={v ?? 0} size="small" />,
                },
                {
                  title: "Huỷ",
                  dataIndex: "cancelRate",
                  width: 80,
                  render: (v) => (v > 0 ? <Tag color="red">{v}%</Tag> : <Tag>0%</Tag>),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Chờ trung bình theo hàng đợi (top)">
            {queueChartData.length === 0 ? (
              <Empty description="Chưa có dữ liệu" />
            ) : (
              <Column
                autoFit
                height={320}
                data={queueChartData}
                xField="name"
                yField="minutes"
                color="#faad14"
                axis={{ y: { title: "Phút" } }}
                columnStyle={{ radiusTopLeft: 4, radiusTopRight: 4 }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
