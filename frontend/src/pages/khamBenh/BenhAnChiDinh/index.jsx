import {
  DollarOutlined,
  EyeOutlined,
  MedicineBoxOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import DoctorActionsModal from "../../../component/DoctorActionsModal";
import PageHeader from "../../../component/PageHeader";
import StatusTag from "../../../component/StatusTag";
import { MODULE_PHONG_BAN } from "../../../const/const";
import http from "../../../util/httpClient";

const PHONG_KHAM_BENH = MODULE_PHONG_BAN.khamBenh; // [2,3,4,14,15]

const fmt = (n) => (n || 0).toLocaleString("vi-VN") + "đ";

/**
 * Trang HIS phụ dưới menu Khám bệnh:
 *   - List BN đang trong queue Khám bệnh (HD=3) — đã gọi (TinhTrang=1)
 *     hoặc đang chờ — để bác sĩ chọn BN khám → ghi bệnh án + chỉ định
 *     CLS + kê đơn thuốc.
 *   - Không có chức năng QMS (gọi STT) ở trang này, chỉ thuần HIS:
 *     bác sĩ thao tác sau khi đã gọi BN bên /kham-benh/quan-ly.
 */
export default function BenhAnChiDinh() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tenBacSi, setTenBacSi] = useState(
    () => localStorage.getItem("tenBacSi") || "",
  );

  // Phòng khám của bác sĩ đang login. Mỗi BS gắn 1 phòng (Sys_Users_PhongBan)
  // → chỉ thấy BN phòng mình. ADMIN bypass trả nhiều phòng → cho chọn, mặc
  // định "Tất cả phòng" (phongBanId=0) để giữ tầm nhìn tổng quan.
  const [phongList, setPhongList] = useState([]);
  const [phongBanId, setPhongBanId] = useState(null); // null = chưa load xong

  // Xem lại bệnh án
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const openView = async (record) => {
    const hdpbId = record.HangDoiPhongBan_Id;
    if (!hdpbId) return message.warning("Thiếu mã lượt khám");
    setViewOpen(true);
    setViewLoading(true);
    setViewData(null);
    try {
      // Bệnh án của ĐÚNG lượt khám này (theo HangDoiPhongBan_Id) — KHÔNG lấy bản
      // mới nhất mọi ngày, nên BN chưa khám hôm nay sẽ hiện "chưa có bệnh án".
      const detail = await http.get(`/benh-an/by-hdpb/${hdpbId}`);
      setViewData(
        detail?.data || { empty: true, TenBenhNhan: record.TenBenhNhan },
      );
    } catch (e) {
      message.error({
        key: "view-ba",
        content: e?.message || "Lỗi tải bệnh án",
      });
      setViewOpen(false);
    } finally {
      setViewLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (phongBanId === null) return; // đợi /user/info xác định phòng
    setLoading(true);
    try {
      const res = await http.get("/kham-benh/danh-sach-benh-nhan", {
        phongBanId,
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      message.error(e?.message || "Không tải được danh sách bệnh nhân khám");
    } finally {
      setLoading(false);
    }
  }, [phongBanId]);

  // 1. Load phòng khám của bác sĩ → quyết định phongBanId mặc định.
  useEffect(() => {
    (async () => {
      try {
        const info = await http.get("/user/info");
        const all = info?.data?.PhongBanList || [];
        const rooms = all.filter((p) =>
          PHONG_KHAM_BENH.includes(Number(p.FieldCode)),
        );
        setPhongList(rooms);
        if (info?.data?.FullName) setTenBacSi(info.data.FullName);
        // 1 phòng (bác sĩ thật) → khóa đúng phòng đó. Nhiều phòng (ADMIN) →
        // mặc định 0 = tất cả. 0 phòng (chưa gán) → 0 để vẫn xem được.
        setPhongBanId(rooms.length === 1 ? Number(rooms[0].FieldCode) : 0);
      } catch {
        setPhongBanId(0); // lỗi info → fallback xem tất cả
      }
    })();
  }, []);

  // 2. Tải danh sách BN mỗi khi phòng đổi (hoặc lần đầu sau khi xác định phòng).
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((r) =>
      Object.values(r || {}).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(text),
      ),
    );
  }, [rows, keyword]);

  // Chuyển tiếp BN sau khi khám (mô hình doctor-transfer). dest:
  //   'vp'=viện phí, 'nt'=nhà thuốc, 'both'=cả hai, 'done'=hoàn tất không chuyển.
  // Mỗi chuyển/hoàn tất đều đóng lượt khám (BE: HoanTatLuotKham).
  const doTransfer = async (hdpbId, dest) => {
    if (!hdpbId) {
      message.warning("Thiếu mã lượt khám");
      return;
    }
    try {
      if (dest === "vp") {
        await http.put(`/kham-benh/chuyen-sang-vp/${hdpbId}`);
      } else if (dest === "nt") {
        await http.put(`/kham-benh/chuyen-sang-nt/${hdpbId}`);
      } else if (dest === "both") {
        // TUẦN TỰ: chỉ đẩy Viện phí. Thu ngân bấm "Thu xong" → hệ thống TỰ đẩy
        // sang Nhà thuốc nếu có đơn thuốc (trả tiền TRƯỚC, lấy thuốc SAU).
        await http.put(`/kham-benh/chuyen-sang-vp/${hdpbId}`);
      } else if (dest === "done") {
        await http.put(`/kham-benh/hoan-tat/${hdpbId}`);
      }
      const label = {
        vp: "Đã chuyển BN sang Viện phí",
        nt: "Đã chuyển BN sang Nhà thuốc",
        both: "Đã chuyển sang Viện phí (thu xong sẽ tự sang Nhà thuốc)",
        done: "Đã hoàn tất lượt khám",
      }[dest];
      message.success(label);
      fetchData();
    } catch (e) {
      message.error(e?.message || "Lỗi chuyển bệnh nhân");
    }
  };

  const openBenhAnFor = (record) => {
    // Map row sang shape DoctorActionsModal mong đợi
    setSelected({
      HangDoiPhongBan_Id: record.HangDoiPhongBan_Id,
      TiepNhan_Id: record.TIEPNHAN_ID || record.TiepNhan_Id || 0,
      TIEPNHAN_ID: record.TIEPNHAN_ID || record.TiepNhan_Id || 0,
      BenhNhan_Id: record.BenhNhan_Id || record.BENHNHAN_ID,
      TenBenhNhan: record.TenBenhNhan,
      MaYTe: record.MaYTe,
      SoThuTuDayDu: record.SoThuTuDayDu || record.STT,
    });
    setModalOpen(true);
  };

  const columns = [
    {
      title: "STT",
      dataIndex: "SoThuTuDayDu",
      key: "stt",
      width: 80,
      align: "center",
      render: (v, r) => (
        <Tag color="blue" style={{ fontWeight: 600, fontSize: 13 }}>
          {v || r?.STT || "-"}
        </Tag>
      ),
    },
    {
      title: "Mã y tế",
      dataIndex: "MaYTe",
      width: 110,
    },
    {
      title: "Tên bệnh nhân",
      dataIndex: "TenBenhNhan",
      render: (v) => <b>{v || "—"}</b>,
    },
    {
      title: "Tuổi",
      dataIndex: "Tuoi",
      width: 70,
      align: "center",
    },
    {
      title: "Giới",
      dataIndex: "GioiTinh",
      width: 70,
      align: "center",
    },
    {
      title: "Phòng",
      dataIndex: "TenPhongBan",
      width: 130,
    },
    {
      title: "Trạng thái",
      dataIndex: "TrangThai",
      width: 110,
      render: (v) => <StatusTag status={v} />,
    },
    {
      title: "Ưu tiên",
      dataIndex: "UuTien",
      width: 80,
      align: "center",
      render: (v) => (v ? <Tag color="red">Ưu tiên</Tag> : "—"),
    },
    {
      title: "Thu phí",
      dataIndex: "ThuTienSau",
      width: 95,
      align: "center",
      render: (v) =>
        v === 1 || v === true ? (
          <StatusTag status="Thu sau" />
        ) : v === 0 || v === false ? (
          <StatusTag status="Thu trước" />
        ) : (
          <span style={{ color: "var(--color-border-strong)" }}>—</span>
        ),
    },
    {
      title: "",
      key: "action",
      width: 400,
      render: (_, record) => {
        const done = record.TrangThai === "Hoàn tất";
        const daKham = record.DaKham === 1 || record.DaKham === true;
        const thuSau =
          record.ThuTienSau === 1 || record.ThuTienSau === true
            ? true
            : record.ThuTienSau === 0 || record.ThuTienSau === false
              ? false
              : null;
        // Thu sau → khuyến nghị qua Viện phí; thu trước → khuyến nghị Hoàn tất.
        const rec = thuSau === true ? "both" : thuSau === false ? "done" : null;
        const star = (k, t) => (rec === k ? t + " ⭐" : t);
        return (
          <Space>
            <Tooltip title="Ghi chẩn đoán + chỉ định CLS + kê đơn">
              <Button
                type="primary"
                icon={<MedicineBoxOutlined />}
                onClick={() => openBenhAnFor(record)}
                disabled={done}
                style={{ background: "#10b981", borderColor: "#10b981" }}
              >
                {done ? "Đã khám" : "Bệnh án + Chỉ định"}
              </Button>
            </Tooltip>
            <Tooltip title="Xem lại bệnh án + chỉ định + đơn thuốc">
              <Button icon={<EyeOutlined />} onClick={() => openView(record)}>
                Xem
              </Button>
            </Tooltip>
            <Tooltip
              title={
                done
                  ? "Đã hoàn tất"
                  : !daKham
                    ? "Cần ghi Bệnh án + Chỉ định trước khi chuyển bệnh nhân"
                    : "Chuyển BN sang viện phí / nhà thuốc khi khám xong"
              }
            >
              <Dropdown
                disabled={done || !daKham}
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "both",
                      icon: <DollarOutlined />,
                      label: star("both", "Viện phí → Nhà thuốc"),
                    },
                    {
                      key: "nt",
                      icon: <MedicineBoxOutlined />,
                      label: "Chỉ Nhà thuốc",
                    },
                    {
                      key: "vp",
                      icon: <DollarOutlined />,
                      label: "Chỉ Viện phí",
                    },
                    { type: "divider" },
                    { key: "done", label: star("done", "Hoàn tất (không chuyển)") },
                  ],
                  onClick: ({ key }) =>
                    doTransfer(record.HangDoiPhongBan_Id, key),
                }}
              >
                <Button icon={<SwapOutlined />}>Chuyển tiếp</Button>
              </Dropdown>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<MedicineBoxOutlined />}
        title="Bệnh án + Chỉ định CLS / Đơn thuốc"
        subtitle="Ghi chẩn đoán, chỉ định CLS và kê đơn thuốc cho bệnh nhân trong queue Khám bệnh"
        extra={
          <>
            {phongList.length > 1 ? (
              // ADMIN / nhiều phòng → chọn phòng, có "Tất cả phòng"
              <Select
                value={phongBanId}
                onChange={setPhongBanId}
                style={{ width: 200 }}
                options={[
                  { value: 0, label: " Tất cả phòng khám" },
                  ...phongList.map((p) => ({
                    value: Number(p.FieldCode),
                    label: p.FieldName || `Phòng ${p.FieldCode}`,
                  })),
                ]}
              />
            ) : phongList.length === 1 ? (
              // Bác sĩ thật → khóa đúng phòng mình
              <Tag color="blue" style={{ fontSize: 13, padding: "4px 10px" }}>
                🏥 {phongList[0].FieldName || `Phòng ${phongList[0].FieldCode}`}
              </Tag>
            ) : null}
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm theo tên / mã y tế / STT..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
              style={{ width: 280 }}
            />
            <PageHeader.Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
            >
              Tải lại
            </PageHeader.Button>
          </>
        }
      />
      <Card>
        <Table
          size="small"
          rowKey={(r) =>
            r.HangDoiPhongBan_Id || `${r.BenhNhan_Id}-${r.SoThuTuDayDu}`
          }
          dataSource={filtered}
          columns={columns}
          loading={loading}
          locale={{
            emptyText: (
              <Empty description="Chưa có BN nào trong queue Khám bệnh hôm nay" />
            ),
          }}
          pagination={{ pageSize: 15, showSizeChanger: false }}
        />
      </Card>

      <DoctorActionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        patient={selected}
        tenBacSi={tenBacSi}
        onSuccess={fetchData}
        onTransfer={doTransfer}
      />

      <Modal
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        width={760}
        title="📋 Bệnh án + Chỉ định + Đơn thuốc"
        footer={[
          <Button key="c" onClick={() => setViewOpen(false)}>
            Đóng
          </Button>,
        ]}
        loading={viewLoading}
        destroyOnClose
      >
        {viewData?.empty ? (
          <Empty
            description={`${viewData.TenBenhNhan || "BN"} chưa có bệnh án hôm nay`}
          />
        ) : viewData ? (
          <>
            <Descriptions
              size="small"
              column={2}
              bordered
              labelStyle={{ width: 120, background: "#fafafa" }}
            >
              <Descriptions.Item label="Bệnh nhân">
                {viewData.TenBenhNhan}
              </Descriptions.Item>
              <Descriptions.Item label="Năm sinh">
                {viewData.NamSinh || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Bác sĩ">
                {viewData.TenBacSi || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày khám">
                {viewData.NgayKham
                  ? new Date(viewData.NgayKham).toLocaleString("vi-VN")
                  : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Lý do khám" span={2}>
                {viewData.LyDoKham || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Triệu chứng" span={2}>
                {viewData.TrieuChung || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Chẩn đoán" span={2}>
                <b>{viewData.ChanDoan}</b>
                {viewData.ChanDoanICD ? ` (${viewData.ChanDoanICD})` : ""}
              </Descriptions.Item>
              <Descriptions.Item label="Hướng điều trị" span={2}>
                {viewData.HuongDieuTri || "—"}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ margin: "16px 0 8px" }}>
              🔬 Chỉ định CLS ({viewData.ChiDinhCLS?.length || 0})
            </Divider>
            <Table
              size="small"
              pagination={false}
              dataSource={viewData.ChiDinhCLS || []}
              rowKey={(r) => r.DVYEUCAU_ID}
              locale={{ emptyText: "Không có chỉ định" }}
              columns={[
                { title: "Dịch vụ", dataIndex: "TENDICHVU", ellipsis: true },
                {
                  title: "Loại",
                  dataIndex: "LoaiDV",
                  width: 80,
                  render: (v) => <Tag>{v}</Tag>,
                },
                {
                  title: "Kết quả",
                  dataIndex: "KetQua_Id",
                  width: 120,
                  render: (v, r) =>
                    v ? (
                      <Tag color="green">Có KQ</Tag>
                    ) : r.TRANGTHAI === "CoKetQua" ? (
                      <Tag color="green">Có KQ</Tag>
                    ) : (
                      <Tag color="orange">Chờ KQ</Tag>
                    ),
                },
              ]}
            />

            <Divider orientation="left" style={{ margin: "16px 0 8px" }}>
              💊 Đơn thuốc ({viewData.Thuoc?.length || 0})
            </Divider>
            <Table
              size="small"
              pagination={false}
              dataSource={viewData.Thuoc || []}
              rowKey={(r) => r.ChiTiet_Id}
              locale={{ emptyText: "Không kê thuốc" }}
              columns={[
                { title: "Thuốc", dataIndex: "TenThuoc", ellipsis: true },
                { title: "ĐV", dataIndex: "DonViTinh", width: 60 },
                { title: "Liều dùng", dataIndex: "LieuDung", ellipsis: true },
              ]}
            />
          </>
        ) : null}
      </Modal>
    </div>
  );
}
