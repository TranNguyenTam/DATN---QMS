import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

const { Text } = Typography;
const BASE = "/emr";

const GIOI_TINH = [
  { value: 1, label: "Nam" },
  { value: 2, label: "Nữ" },
  { value: 3, label: "Khác" },
];

const DAN_TOC = [
  "Kinh", "Tày", "Thái", "Mường", "Khmer", "Hoa", "Nùng", "H'Mông", "Dao",
  "Gia Rai", "Khác",
];

const NGHE_NGHIEP = [
  "Học sinh - Sinh viên", "Cán bộ - Công chức", "Công nhân", "Nông dân",
  "Lao động tự do", "Hưu trí", "Nội trợ", "Khác",
];

const NHOM_MAU = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Chưa rõ"];

const TINH_THANH = [
  "Đà Nẵng", "TP. Hồ Chí Minh", "Hà Nội", "Quảng Nam", "Quảng Ngãi",
  "Thừa Thiên Huế", "Hải Phòng", "Cần Thơ", "Khánh Hòa", "Bình Định",
];

const PHUONG_XA = [
  "Phường Hải Châu I", "Phường Thạch Thang", "Phường Bình Hiên",
  "Phường Hòa Cường Bắc", "Phường Mỹ An", "Phường Khuê Mỹ", "Khác",
];

const fmtDate = (v) => (v ? dayjs(v).format("DD/MM/YYYY") : "—");
const fmtDateTime = (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—");

/**
 * Pha 6 — Quản lý bệnh nhân (HIS-light).
 *
 * Source: dbo.BenhNhan + dbo.BenhNhan_BHYT + dbo.TiepNhan (QMS_DA local).
 * CRUD đầy đủ:
 *  - List paged + filter (search, đối tượng, giới tính).
 *  - View chi tiết (3 tabs: Thông tin / BHYT / Lịch sử TN).
 *  - Edit info + BHYT (atomic).
 *  - Soft delete (ACTIVE='0' — không xóa row).
 */
export default function DanhSachBenhNhan() {
  // ── List state ─────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  // Filter
  const [keyword, setKeyword] = useState("");
  const [appliedKw, setAppliedKw] = useState("");
  const [filterDoiTuong, setFilterDoiTuong] = useState(null);
  const [filterGioiTinh, setFilterGioiTinh] = useState(null);
  const [doiTuongs, setDoiTuongs] = useState([]);

  // ── Detail modal ───────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Edit modal ─────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form] = Form.useForm();

  // ── Load DM đối tượng ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await http.get(`${BASE}/danh-muc-doi-tuong`);
        setDoiTuongs(res?.data || []);
      } catch (e) {
        console.warn(e);
      }
    })();
  }, []);

  // ── Load list ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (appliedKw) params.q = appliedKw;
      if (filterGioiTinh != null) params.gioiTinh = filterGioiTinh;
      if (filterDoiTuong != null) params.doiTuongId = filterDoiTuong;
      const res = await http.get(`${BASE}/benh-nhan`, params);
      const data = res?.data ?? res;
      setRows(data?.Items || data?.items || []);
      setTotal(data?.Total ?? data?.total ?? 0);
    } catch (e) {
      message.error(e?.message || "Không tải được danh sách bệnh nhân");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedKw, filterGioiTinh, filterDoiTuong]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Detail handler ─────────────────────────────────────────
  const openDetail = async (id) => {
    setDetailOpen(true);
    setDetail(null);
    setHistory([]);
    setDetailLoading(true);
    try {
      const [d, h] = await Promise.all([
        http.get(`${BASE}/benh-nhan/${id}`),
        http.get(`${BASE}/benh-nhan/${id}/tiep-nhan`),
      ]);
      setDetail(d?.data || null);
      setHistory(h?.data || []);
    } catch (e) {
      message.error(e?.message || "Không tải được chi tiết");
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Edit handler ───────────────────────────────────────────
  const openEdit = async (id) => {
    setEditingId(id);
    setEditOpen(true);
    setSavingEdit(false);
    form.resetFields();
    try {
      const res = await http.get(`${BASE}/benh-nhan/${id}`);
      const d = res?.data;
      if (!d) {
        message.error("Không tìm thấy bệnh nhân");
        setEditOpen(false);
        return;
      }
      form.setFieldsValue({
        hoTen: d.TenBenhNhan,
        gioiTinh: d.GioiTinh,
        ngaySinh: d.NgaySinh ? dayjs(d.NgaySinh) : null,
        namSinh: d.NamSinh,
        cccd: d.CMND,
        soDienThoai: d.SoDienThoai,
        danToc: d.MaDanToc,
        ngheNghiep: d.MaNgheNghiep,
        nhomMau: d.NhomMau,
        tinh: d.MaTinh,
        phuongXa: d.MaXa,
        diaChi: d.DiaChi,
        email: d.Email,
        // BHYT
        soBHYT: d.SoBHYT,
        bhytTuNgay: d.BhytTuNgay ? dayjs(d.BhytTuNgay) : null,
        bhytDenNgay: d.BhytDenNgay ? dayjs(d.BhytDenNgay) : null,
        doiTuongId: d.MaDoiTuong || "DV",
      });
    } catch (e) {
      message.error(e?.message || "Không tải được dữ liệu BN");
      setEditOpen(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const v = await form.validateFields();
      setSavingEdit(true);
      const payload = {
        benhNhan: {
          hoTen: v.hoTen?.trim(),
          gioiTinh: v.gioiTinh,
          namSinh: v.namSinh,
          ngaySinh: v.ngaySinh ? v.ngaySinh.toISOString() : null,
          cccd: v.cccd,
          soDienThoai: v.soDienThoai,
          maDanToc: v.danToc,
          maNgheNghiep: v.ngheNghiep,
          nhomMau: v.nhomMau,
          maTinh: v.tinh,
          maXa: v.phuongXa,
          diaChi: v.diaChi,
          email: v.email,
        },
        bhyt: v.soBHYT
          ? {
              soBHYT: v.soBHYT,
              ngayBatDau: v.bhytTuNgay ? v.bhytTuNgay.toISOString() : null,
              ngayKetThuc: v.bhytDenNgay ? v.bhytDenNgay.toISOString() : null,
              maQuyenLoi: v.doiTuongId,
            }
          : null,
      };
      await http.put(`${BASE}/benh-nhan/${editingId}`, payload);
      message.success("Cập nhật thành công");
      setEditOpen(false);
      load();
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || "Lưu thất bại");
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Soft delete ────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await http.del(`${BASE}/benh-nhan/${id}`);
      message.success("Đã xóa bệnh nhân khỏi danh sách");
      load();
    } catch (e) {
      message.error(e?.message || "Xóa thất bại");
    }
  };

  // ── Table columns ──────────────────────────────────────────
  const columns = [
    {
      title: "Mã y tế",
      dataIndex: "MaYTe",
      key: "MaYTe",
      width: 130,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: "Họ tên",
      dataIndex: "TenBenhNhan",
      key: "TenBenhNhan",
      width: 220,
    },
    {
      title: "Giới tính",
      dataIndex: "GioiTinhText",
      key: "GioiTinhText",
      width: 90,
      render: (v) => v || "—",
    },
    {
      title: "Năm sinh",
      dataIndex: "NamSinh",
      key: "NamSinh",
      width: 90,
      render: (v) => v || "—",
    },
    {
      title: "SĐT",
      dataIndex: "SoDienThoai",
      key: "SoDienThoai",
      width: 130,
      render: (v) => v || "—",
    },
    {
      title: "Đối tượng",
      key: "doiTuong",
      width: 140,
      render: (_, row) =>
        row.MaDoiTuong ? (
          <Tag color="blue">{row.MaDoiTuong}</Tag>
        ) : (
          <Tag>DV</Tag>
        ),
    },
    {
      title: "Số thẻ BHYT",
      dataIndex: "SoBHYT",
      key: "SoBHYT",
      width: 200,
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "Thao tác",
      key: "act",
      width: 230,
      fixed: "right",
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openDetail(row.BenhNhanId)}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<EditOutlined />}
            onClick={() => openEdit(row.BenhNhanId)}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xóa BN này khỏi danh sách?"
            description="Soft delete — BN sẽ bị ẩn (Active=0), không xóa khỏi DB."
            onConfirm={() => handleDelete(row.BenhNhanId)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    { title: "Số TN", dataIndex: "SoTiepNhan", width: 130 },
    {
      title: "Ngày",
      dataIndex: "NgayTiepNhan",
      width: 150,
      render: fmtDateTime,
    },
    {
      title: "Phòng tiếp nhận",
      dataIndex: "TenPhongBan",
      render: (v) => v || "—",
    },
    {
      title: "Đối tượng",
      dataIndex: "TenDoiTuong",
      width: 130,
      render: (v) => v || "—",
    },
    { title: "Lý do khám", dataIndex: "LyDoKham", render: (v) => v || "—" },
    {
      title: "BS chỉ định",
      dataIndex: "BacSiChiDinh",
      width: 150,
      render: (v) => v || "—",
    },
    {
      title: "TT",
      dataIndex: "TrangThai",
      width: 90,
      render: (v) => <Tag>{v || "—"}</Tag>,
    },
  ];

  return (
    <div style={{ padding: 16, paddingBottom: 80 }}>
      <PageHeader
        icon={<TeamOutlined />}
        title="Quản lý bệnh nhân"
        subtitle="Danh sách bệnh nhân hệ thống QMS — chi tiết, sửa, xóa mềm"
        tone="admin"
      />

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <Input
          placeholder="Tìm tên / mã y tế / CCCD / SĐT"
          allowClear
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={() => {
            setPage(1);
            setAppliedKw(keyword.trim());
          }}
        />
        <Select
          placeholder="Đối tượng BHYT"
          allowClear
          style={{ width: 220 }}
          value={filterDoiTuong}
          onChange={(v) => {
            setFilterDoiTuong(v ?? null);
            setPage(1);
          }}
          options={doiTuongs.map((d) => ({
            value: d.DoiTuongId,
            label: `${d.Ma} — ${d.TenDoiTuong}`,
          }))}
        />
        <Select
          placeholder="Giới tính"
          allowClear
          style={{ width: 140 }}
          value={filterGioiTinh}
          onChange={(v) => {
            setFilterGioiTinh(v ?? null);
            setPage(1);
          }}
          options={GIOI_TINH}
        />
        <Button
          type="primary"
          onClick={() => {
            setPage(1);
            setAppliedKw(keyword.trim());
          }}
        >
          Tìm
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setKeyword("");
            setAppliedKw("");
            setFilterDoiTuong(null);
            setFilterGioiTinh(null);
            setPage(1);
          }}
        >
          Reset
        </Button>
      </div>

      <Table
        rowKey="BenhNhanId"
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1300 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (t) => `Tổng ${t} bệnh nhân`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* ── Modal chi tiết (3 tabs) ─────────────────────────── */}
      <Modal
        open={detailOpen}
        title={
          detail
            ? `Chi tiết bệnh nhân — ${detail.TenBenhNhan} (${detail.MaYTe})`
            : "Chi tiết bệnh nhân"
        }
        width={900}
        footer={[
          <Button key="close" onClick={() => setDetailOpen(false)}>
            Đóng
          </Button>,
        ]}
        onCancel={() => setDetailOpen(false)}
        destroyOnClose
      >
        {detailLoading ? (
          <Alert type="info" message="Đang tải..." />
        ) : !detail ? (
          <Alert type="warning" message="Không có dữ liệu" />
        ) : (
          <Tabs
            defaultActiveKey="info"
            items={[
              {
                key: "info",
                label: "Thông tin",
                children: (
                  <Descriptions
                    bordered
                    column={2}
                    size="small"
                    labelStyle={{ width: 150 }}
                  >
                    <Descriptions.Item label="Mã y tế">
                      <Text strong>{detail.MaYTe}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Họ tên">
                      {detail.TenBenhNhan}
                    </Descriptions.Item>
                    <Descriptions.Item label="Giới tính">
                      {detail.GioiTinhText || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Ngày sinh">
                      {fmtDate(detail.NgaySinh)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Năm sinh">
                      {detail.NamSinh || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="CCCD/CMND">
                      {detail.CMND || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="SĐT">
                      {detail.SoDienThoai || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Email">
                      {detail.Email || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Dân tộc">
                      {detail.MaDanToc || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nghề nghiệp">
                      {detail.MaNgheNghiep || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhóm máu">
                      {detail.NhomMau || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tỉnh/TP">
                      {detail.MaTinh || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Phường/Xã">
                      {detail.MaXa || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Địa chỉ" span={2}>
                      {detail.DiaChi || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Ngày tạo" span={2}>
                      {fmtDateTime(detail.NgayTao)}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: "bhyt",
                label: "BHYT",
                children: detail.SoBHYT ? (
                  <Descriptions
                    bordered
                    column={2}
                    size="small"
                    labelStyle={{ width: 150 }}
                  >
                    <Descriptions.Item label="Đối tượng">
                      <Tag color="blue">
                        {detail.MaDoiTuong} — {detail.TenDoiTuong}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Tỷ lệ BHYT">
                      {detail.TyLeBhyt != null
                        ? `${Math.round(detail.TyLeBhyt * 100)}%`
                        : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Số thẻ" span={2}>
                      <Text strong copyable>
                        {detail.SoBHYT}
                      </Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Hiệu lực từ">
                      {fmtDate(detail.BhytTuNgay)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Hiệu lực đến">
                      {fmtDate(detail.BhytDenNgay)}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Alert
                    type="info"
                    message="Bệnh nhân chưa có thẻ BHYT trong hệ thống."
                  />
                ),
              },
              {
                key: "tn",
                label: `Lịch sử tiếp nhận (${history.length})`,
                children: (
                  <Table
                    size="small"
                    rowKey="TiepNhanId"
                    dataSource={history}
                    columns={historyColumns}
                    pagination={{ pageSize: 10 }}
                    locale={{ emptyText: "Chưa có lần tiếp nhận nào." }}
                  />
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* ── Modal sửa ───────────────────────────────────────── */}
      <Modal
        open={editOpen}
        title="Sửa thông tin bệnh nhân"
        width={900}
        onCancel={() => setEditOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={savingEdit}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form layout="vertical" form={form} requiredMark={false}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Thông tin cá nhân
          </Typography.Title>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Họ và tên"
                name="hoTen"
                rules={[{ required: true, message: "Nhập họ tên" }]}
              >
                <Input placeholder="Nguyễn Văn A" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                label="Giới tính"
                name="gioiTinh"
                rules={[{ required: true, message: "Chọn giới tính" }]}
              >
                <Select options={GIOI_TINH} placeholder="--" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Năm sinh" name="namSinh">
                <InputNumber
                  min={1900}
                  max={2030}
                  style={{ width: "100%" }}
                  placeholder="1990"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Ngày sinh" name="ngaySinh">
                <DatePicker
                  style={{ width: "100%" }}
                  format="DD/MM/YYYY"
                  placeholder="dd/mm/yyyy"
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="CCCD/CMND" name="cccd">
                <Input maxLength={20} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Số điện thoại" name="soDienThoai">
                <Input maxLength={15} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Dân tộc" name="danToc">
                <Select
                  placeholder="--"
                  allowClear
                  options={DAN_TOC.map((x) => ({ value: x, label: x }))}
                  showSearch
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Nghề nghiệp" name="ngheNghiep">
                <Select
                  placeholder="--"
                  allowClear
                  options={NGHE_NGHIEP.map((x) => ({ value: x, label: x }))}
                  showSearch
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Nhóm máu" name="nhomMau">
                <Select
                  placeholder="--"
                  allowClear
                  options={NHOM_MAU.map((x) => ({ value: x, label: x }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Tỉnh/TP" name="tinh">
                <Select
                  placeholder="--"
                  allowClear
                  options={TINH_THANH.map((x) => ({ value: x, label: x }))}
                  showSearch
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Phường/Xã" name="phuongXa">
                <Select
                  placeholder="--"
                  allowClear
                  options={PHUONG_XA.map((x) => ({ value: x, label: x }))}
                  showSearch
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item label="Địa chỉ" name="diaChi">
                <Input placeholder="Số nhà / đường / khu phố" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Email" name="email">
                <Input placeholder="email@example.com" />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Title level={5}>Thông tin BHYT</Typography.Title>
          <Row gutter={12}>
            <Col xs={12} md={8}>
              <Form.Item label="Đối tượng" name="doiTuongId">
                <Select
                  placeholder="--"
                  options={doiTuongs.map((d) => ({
                    value: d.Ma,
                    label: `${d.Ma} — ${d.TenDoiTuong}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item label="Số thẻ BHYT" name="soBHYT">
                <Input placeholder="VD: GD4484820..." maxLength={50} />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item label="Hiệu lực từ" name="bhytTuNgay">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item label="Hiệu lực đến" name="bhytDenNgay">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
