import {
  EyeOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Select,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import BenhAnViewModal from "../../../component/BenhAnViewModal";
import PageHeader from "../../../component/PageHeader";
import { MODULE_PHONG_BAN } from "../../../const/const";
import http from "../../../util/httpClient";

const { RangePicker } = DatePicker;
const PHONG_KHAM = MODULE_PHONG_BAN.khamBenh; // [2,3,4,14,15]

/**
 * Lịch sử khám bệnh — duyệt bệnh án đã khám theo NGÀY (khác Bệnh án+Chỉ định
 * chỉ xem queue hôm nay). Lọc khoảng ngày + phòng + tên/mã y tế.
 */
export default function LichSuKhamBenh() {
  const [range, setRange] = useState([dayjs(), dayjs()]); // mặc định hôm nay
  const [phongBanId, setPhongBanId] = useState(0); // 0 = tất cả
  const [phongList, setPhongList] = useState([]);
  const [keyword, setKeyword] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewId, setViewId] = useState(null);

  // Load phòng khám cho bộ lọc (theo user; ADMIN thấy tất cả phòng khám).
  useEffect(() => {
    (async () => {
      try {
        const info = await http.get("/user/info");
        const all = info?.data?.PhongBanList || [];
        setPhongList(
          all.filter((p) => PHONG_KHAM.includes(Number(p.FieldCode))),
        );
      } catch {
        setPhongList([]);
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (!range?.[0] || !range?.[1]) return;
    setLoading(true);
    try {
      const res = await http.get("/benh-an/danh-sach", {
        tuNgay: range[0].format("YYYY-MM-DD"),
        denNgay: range[1].format("YYYY-MM-DD"),
        phongBanId,
        keyword: keyword.trim(),
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      message.error(e?.message || "Không tải được lịch sử khám bệnh");
    } finally {
      setLoading(false);
    }
  }, [range, phongBanId, keyword]);

  // Tự tải khi đổi ngày/phòng (keyword thì bấm Tìm hoặc Enter).
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, phongBanId]);

  const columns = [
    {
      title: "Ngày khám",
      dataIndex: "NgayKham",
      width: 150,
      render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
    },
    { title: "Mã y tế", dataIndex: "MaYTe", width: 120 },
    {
      title: "Tên bệnh nhân",
      dataIndex: "TenBenhNhan",
      render: (v) => <b>{v || "—"}</b>,
    },
    { title: "Tuổi", dataIndex: "Tuoi", width: 60, align: "center" },
    {
      title: "Chẩn đoán",
      dataIndex: "ChanDoan",
      ellipsis: true,
      render: (v, r) => (
        <Tooltip title={v}>
          {v || "—"}
          {r.ChanDoanICD ? (
            <Tag style={{ marginLeft: 4 }}>{r.ChanDoanICD}</Tag>
          ) : null}
        </Tooltip>
      ),
    },
    {
      title: "Bác sĩ",
      dataIndex: "TenBacSi",
      width: 150,
      ellipsis: true,
      render: (v) => v || "—",
    },
    {
      title: "Phòng",
      dataIndex: "TenPhongBan",
      width: 130,
      render: (v) => v || "—",
    },
    {
      title: "CLS",
      dataIndex: "SoCLS",
      width: 60,
      align: "center",
      render: (v) => (v > 0 ? <Tag color="blue">{v}</Tag> : "—"),
    },
    {
      title: "Đơn",
      dataIndex: "SoDonThuoc",
      width: 60,
      align: "center",
      render: (v) => (v > 0 ? <Tag color="purple">{v}</Tag> : "—"),
    },
    {
      title: "",
      key: "action",
      width: 90,
      render: (_, r) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setViewId(r.BenhAn_Id)}
        >
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<HistoryOutlined />}
        title="Lịch sử khám bệnh"
        subtitle="Duyệt các bệnh án đã khám theo ngày — xem ai khám ngày nào, chẩn đoán, chỉ định, đơn thuốc."
        extra={
          <>
            <RangePicker
              value={range}
              onChange={(v) => setRange(v || [dayjs(), dayjs()])}
              format="DD/MM/YYYY"
              allowClear={false}
            />
            {phongList.length > 0 && (
              <Select
                value={phongBanId}
                onChange={setPhongBanId}
                style={{ width: 180 }}
                options={[
                  { value: 0, label: " Tất cả phòng" },
                  ...phongList.map((p) => ({
                    value: Number(p.FieldCode),
                    label: p.FieldName || `Phòng ${p.FieldCode}`,
                  })),
                ]}
              />
            )}
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tên / mã y tế..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={fetchData}
              allowClear
              style={{ width: 220 }}
            />
            <PageHeader.Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={fetchData}
            >
              Tìm
            </PageHeader.Button>
            <PageHeader.Button icon={<ReloadOutlined />} onClick={fetchData}>
              Tải lại
            </PageHeader.Button>
          </>
        }
      />
      <Card>
        <Table
          size="small"
          rowKey="BenhAn_Id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          locale={{
            emptyText: (
              <Empty description="Không có bệnh án trong khoảng đã chọn" />
            ),
          }}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (t) => `${t} bệnh án`,
          }}
        />
      </Card>

      <BenhAnViewModal
        open={!!viewId}
        benhAnId={viewId}
        onClose={() => setViewId(null)}
      />
    </div>
  );
}
