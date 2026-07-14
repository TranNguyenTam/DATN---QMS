import { useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Select, Space, Statistic, Table, Tag, Typography, message } from "antd";
import http from "../../util/httpClient";

const { Title, Text } = Typography;

const fmt = (n) => (n || 0).toLocaleString("vi-VN") + "đ";

export default function BaoCaoDoanhThu() {
  const [days, setDays] = useState(7);
  const [revenue, setRevenue] = useState([]);
  const [topDv, setTopDv] = useState([]);
  const [topBs, setTopBs] = useState([]);
  const [byLoai, setByLoai] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async (n) => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        http.get("/dashboard/revenue", { days: n }),
        http.get("/dashboard/top-services", { days: n, top: 10 }),
        http.get("/dashboard/top-doctors", { days: n, top: 10 }),
        http.get("/dashboard/revenue-by-loai", { days: n }),
      ]);
      setRevenue(r1?.data || []);
      setTopDv(r2?.data || []);
      setTopBs(r3?.data || []);
      setByLoai(r4?.data || []);
    } catch (e) {
      message.error(e?.message || "Lỗi tải báo cáo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll(days);
  }, [days]);

  const summary = useMemo(() => {
    const tongHd = revenue.reduce((s, r) => s + (r.SoHoaDon || 0), 0);
    const tongThu = revenue.reduce((s, r) => s + (r.DaThu || 0), 0);
    const tongChua = revenue.reduce((s, r) => s + (r.ChuaThu || 0), 0);
    return { tongHd, tongThu, tongChua };
  }, [revenue]);

  // Chart đơn giản dạng bar bằng CSS (không cần lib chart)
  const maxRev = Math.max(1, ...revenue.map((r) => (r.DaThu || 0) + (r.ChuaThu || 0)));

  return (
    <div style={{ padding: 16 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            📊 Báo cáo doanh thu
          </Title>
        </Col>
        <Col>
          <Space>
            <Text>Khoảng thời gian:</Text>
            <Select
              value={days}
              onChange={setDays}
              style={{ width: 140 }}
              options={[
                { value: 1, label: "Hôm nay" },
                { value: 7, label: "7 ngày" },
                { value: 14, label: "14 ngày" },
                { value: 30, label: "30 ngày" },
                { value: 60, label: "60 ngày" },
              ]}
            />
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Tổng hóa đơn" value={summary.tongHd} suffix="HĐ" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Đã thu"
              value={summary.tongThu}
              formatter={(v) => fmt(v)}
              valueStyle={{ color: "var(--color-success)" }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Chưa thu"
              value={summary.tongChua}
              formatter={(v) => fmt(v)}
              valueStyle={{ color: "var(--color-error)" }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Doanh thu theo ngày" style={{ marginBottom: 16 }} loading={loading}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 220, padding: "0 8px" }}>
          {revenue.map((r) => {
            const total = (r.DaThu || 0) + (r.ChuaThu || 0);
            const h = Math.max(2, (total / maxRev) * 180);
            const hThu = Math.max(0, ((r.DaThu || 0) / maxRev) * 180);
            const day = r.Ngay ? new Date(r.Ngay).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : "";
            return (
              <div key={r.Ngay} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>{fmt(total)}</div>
                <div
                  title={`${day}: ${fmt(r.DaThu)} đã thu / ${fmt(r.ChuaThu)} chưa thu`}
                  style={{
                    width: "100%",
                    height: h,
                    background: "#fecaca",
                    borderRadius: 4,
                    position: "relative",
                    transition: "all 0.3s",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: hThu,
                      background: "#16a34a",
                      borderRadius: "0 0 4px 4px",
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: "#475569" }}>{day}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{r.SoHoaDon || 0} HĐ</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
          <span style={{ display: "inline-block", width: 12, height: 12, background: "#16a34a", marginRight: 4, verticalAlign: "middle" }} />
          Đã thu &nbsp;&nbsp;
          <span style={{ display: "inline-block", width: 12, height: 12, background: "#fecaca", marginRight: 4, verticalAlign: "middle" }} />
          Chưa thu
        </div>
      </Card>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="💵 Doanh thu theo loại" loading={loading}>
            <Table
              size="small"
              pagination={false}
              dataSource={byLoai}
              rowKey="Loai"
              columns={[
                {
                  title: "Loại",
                  dataIndex: "Loai",
                  render: (v) => (
                    <Tag color={v === "Thuoc" ? "magenta" : v === "KhamBenh" ? "blue" : v === "CLS" ? "green" : "orange"}>
                      {v}
                    </Tag>
                  ),
                },
                { title: "Số mục", dataIndex: "SoMuc", align: "right", width: 80 },
                { title: "Doanh thu", dataIndex: "DoanhThu", align: "right", render: fmt },
              ]}
              locale={{ emptyText: "Chưa có hóa đơn đã thu" }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="🩺 Top bác sĩ" loading={loading}>
            <Table
              size="small"
              pagination={false}
              dataSource={topBs}
              rowKey={(r, i) => i}
              columns={[
                { title: "Bác sĩ", dataIndex: "BacSi" },
                { title: "Lượt khám", dataIndex: "SoLuotKham", align: "right", width: 90 },
                { title: "CLS", dataIndex: "SoChiDinhCLS", align: "right", width: 70 },
                { title: "Đơn", dataIndex: "SoDonThuoc", align: "right", width: 70 },
              ]}
              locale={{ emptyText: "Chưa có bệnh án" }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="🏆 Top 10 dịch vụ phổ biến" loading={loading}>
        <Table
          size="small"
          pagination={false}
          dataSource={topDv}
          rowKey="DICHVU_ID"
          columns={[
            {
              title: "#",
              width: 50,
              render: (_, __, i) => <Tag color={i < 3 ? "gold" : "default"}>{i + 1}</Tag>,
            },
            { title: "Tên dịch vụ", dataIndex: "TENDICHVU" },
            {
              title: "Loại",
              dataIndex: "LoaiDV",
              width: 100,
              render: (v) => (
                <Tag color={v === "Thuoc" ? "magenta" : v === "CLS" ? "green" : v === "CDHA" ? "orange" : "blue"}>
                  {v}
                </Tag>
              ),
            },
            { title: "Đơn giá", dataIndex: "DonGia", align: "right", render: fmt, width: 120 },
            { title: "Lượt chỉ định", dataIndex: "SoLuotChiDinh", align: "right", width: 120 },
            {
              title: "Doanh thu",
              dataIndex: "DoanhThu",
              align: "right",
              render: (v) => <b style={{ color: "#16a34a" }}>{fmt(v)}</b>,
              width: 140,
            },
          ]}
          locale={{ emptyText: "Chưa có chỉ định" }}
        />
      </Card>
    </div>
  );
}
