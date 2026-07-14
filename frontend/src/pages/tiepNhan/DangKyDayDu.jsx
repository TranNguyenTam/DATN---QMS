import {
  CheckCircleOutlined,
  DeleteOutlined,
  FileAddOutlined,
  IdcardOutlined,
  MedicineBoxOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

const { Title, Text } = Typography;
const BASE = "/emr";

// Mini-lookup hardcoded (PoC) — đủ cho demo đồ án, không cần catalog admin.
const GIOI_TINH = [
  { value: 1, label: "Nam" },
  { value: 2, label: "Nữ" },
  { value: 3, label: "Khác" },
];

const DAN_TOC = [
  "Kinh",
  "Tày",
  "Thái",
  "Mường",
  "Khmer",
  "Hoa",
  "Nùng",
  "H'Mông",
  "Dao",
  "Gia Rai",
  "Khác",
];

const NGHE_NGHIEP = [
  "Học sinh - Sinh viên",
  "Cán bộ - Công chức",
  "Công nhân",
  "Nông dân",
  "Lao động tự do",
  "Hưu trí",
  "Nội trợ",
  "Khác",
];

const NHOM_MAU = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Chưa rõ"];

const TINH_THANH = [
  "Đà Nẵng",
  "TP. Hồ Chí Minh",
  "Hà Nội",
  "Quảng Nam",
  "Quảng Ngãi",
  "Thừa Thiên Huế",
  "Hải Phòng",
  "Cần Thơ",
  "Khánh Hòa",
  "Bình Định",
];

const PHUONG_XA = [
  "Phường Hải Châu I",
  "Phường Thạch Thang",
  "Phường Bình Hiên",
  "Phường Hòa Cường Bắc",
  "Phường Mỹ An",
  "Phường Khuê Mỹ",
  "Khác",
];

/**
 * Pha 5 — Đăng ký bệnh nhân đầy đủ (HIS-light).
 *
 * Luồng:
 *  1. (Tùy chọn) Tra cứu BN cũ theo MAYTE → fill form.
 *  2. Nhập 14 trường BN + BHYT panel.
 *  3. Bấm "Tiếp nhận" → tạo TN (auto-tạo BN nếu chưa có) → hiển thị panel CLS.
 *  4. Search dịch vụ → thêm vào danh sách → "Lưu chỉ định" tạo DichVuYeuCau.
 */
export default function DangKyDayDu() {
  const [form] = Form.useForm();
  const [doiTuongs, setDoiTuongs] = useState([]);
  const [phongBans, setPhongBans] = useState([]);
  const [maYTeSearch, setMaYTeSearch] = useState("");
  const [searchingBn, setSearchingBn] = useState(false);
  const [foundBn, setFoundBn] = useState(null); // { benhNhanId, maYTe }

  const [savingTn, setSavingTn] = useState(false);
  const [tiepNhan, setTiepNhan] = useState(null); // { tiepNhanId, soTiepNhan, benhNhanId, maYTe, hangDoiPhongBanId, hangDoiSTT }
  const [qrOpen, setQrOpen] = useState(false); // modal QR theo dõi sau tiếp nhận

  // Panel CLS
  const [dvOptions, setDvOptions] = useState([]);
  const [dvSearchKey, setDvSearchKey] = useState("");
  const [selectedDv, setSelectedDv] = useState([]); // { dichVuId, maDichVu, tenDichVu, soLuong, donGia }
  const [savingCls, setSavingCls] = useState(false);
  const [savedDv, setSavedDv] = useState([]);

  // ── Init ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [dt, pb] = await Promise.all([
          http.get(`${BASE}/danh-muc-doi-tuong`),
          http.get("/danh-muc/phong-ban"),
        ]);
        setDoiTuongs(dt?.data || []);
        setPhongBans(pb?.data || []);
        // Mặc định đối tượng DV.
        form.setFieldsValue({ doiTuongId: "DV" });
      } catch (e) {
        message.error(e?.message || "Không tải được danh mục");
      }
    };
    load();
  }, [form]);

  // Form.useWatch → giá trị doiTuongId REACTIVE: khi đổi Đối tượng thì component
  // re-render và Tỷ lệ % tính lại. (Trước đây dùng form.getFieldValue đọc lúc
  // render — AntD Form uncontrolled nên không re-render → tỷ lệ kẹt ở DV = 0%.)
  const watchedDoiTuongId = Form.useWatch("doiTuongId", form);
  const selectedDoiTuong = useMemo(
    () => doiTuongs.find((d) => d.Ma === watchedDoiTuongId),
    [doiTuongs, watchedDoiTuongId],
  );

  // ── Tra cứu BN cũ ─────────────────────────────────────────────
  const handleSearchBn = async () => {
    const ma = (maYTeSearch || "").trim();
    if (!ma) {
      message.warning("Nhập mã y tế trước khi tra cứu");
      return;
    }
    setSearchingBn(true);
    try {
      const res = await http.get(`${BASE}/benh-nhan/by-ma-y-te`, { maYTe: ma });
      const bn = res?.data?.benhNhan;
      const bhyt = res?.data?.bhyt;
      if (!bn) {
        setFoundBn(null);
        message.info("Chưa có BN trong hệ thống — nhập thông tin mới.");
        return;
      }
      setFoundBn({ benhNhanId: bn.BenhNhanId, maYTe: bn.MAYTE });
      // Fill form từ BN cũ (chỉ các trường có sẵn).
      form.setFieldsValue({
        hoTen: bn.TenBenhNhan,
        gioiTinh: bn.GioiTinh,
        ngaySinh: bn.NgaySinh ? dayjs(bn.NgaySinh) : null,
        namSinh: bn.NamSinh,
        cccd: bn.CMND,
        soDienThoai: bn.SoDienThoai,
        diaChi: bn.DiaChi,
        email: bn.EMAIL,
        soBHYT: bhyt?.SoThe,
        bhytTuNgay: bhyt?.NgayBatDau ? dayjs(bhyt.NgayBatDau) : null,
        bhytDenNgay: bhyt?.NgayKetThuc ? dayjs(bhyt.NgayKetThuc) : null,
      });
      message.success(`Đã tải BN: ${bn.TenBenhNhan}`);
    } catch (e) {
      message.error(e?.message || "Lỗi tra cứu");
    } finally {
      setSearchingBn(false);
    }
  };

  // ── Submit tiếp nhận ──────────────────────────────────────────
  const handleSubmitTiepNhan = async () => {
    try {
      const v = await form.validateFields();
      setSavingTn(true);

      const benhNhanPayload = {
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
      };
      const bhytPayload = v.soBHYT
        ? {
            soBHYT: v.soBHYT,
            ngayBatDau: v.bhytTuNgay ? v.bhytTuNgay.toISOString() : null,
            ngayKetThuc: v.bhytDenNgay ? v.bhytDenNgay.toISOString() : null,
            maQuyenLoi: v.doiTuongId,
          }
        : null;

      const reqBody = {
        benhNhanId: foundBn?.benhNhanId ?? null,
        // Luôn gửi thông tin form → backend TẠO MỚI (BN chưa có) hoặc CẬP NHẬT hồ sơ
        // BN đã có (chỉ trường có giá trị, không ghi đè rỗng).
        benhNhan: benhNhanPayload,
        bhyt: bhytPayload,
        doiTuongId: v.doiTuongId,
        lyDoKham: v.lyDoKham,
        bacSiChiDinh: v.bacSiChiDinh,
        // Phòng khám gán LÚC GỌI (queue pooled) → mặc định Phòng Khám 1 (PB2).
        noiTiepNhanId: v.noiTiepNhanId || 2,
      };

      const res = await http.post(`${BASE}/tiep-nhan`, reqBody);
      const tn = res?.data;
      if (!tn?.tiepNhanId) {
        message.error("Không nhận được mã tiếp nhận từ server");
        return;
      }
      setTiepNhan(tn);
      setQrOpen(true); // tự mở QR theo dõi cho BN quét bằng điện thoại
      if (tn.daTiepNhanTruoc) {
        message.warning(
          `BN đã được tiếp nhận hôm nay — dùng lại số cũ (STT ${tn.hangDoiSTT}), không tạo số mới.`,
        );
      } else {
        message.success(
          `Tiếp nhận thành công: ${tn.soTiepNhan} (BN: ${tn.maYTe})`,
        );
      }
    } catch (e) {
      if (e?.errorFields) return; // lỗi validate AntD
      message.error(e?.message || "Tiếp nhận thất bại");
    } finally {
      setSavingTn(false);
    }
  };

  // ── Search dịch vụ ────────────────────────────────────────────
  const onSearchDv = async (kw) => {
    setDvSearchKey(kw);
    if (!kw || kw.length < 1) {
      setDvOptions([]);
      return;
    }
    try {
      const res = await http.get(`${BASE}/dich-vu-search`, {
        q: kw,
        limit: 20,
      });
      const items = (res?.data || []).map((d) => ({
        value: String(d.DichVuId),
        label: `${d.MaDichVu} — ${d.TenDichVu}`,
        raw: d,
      }));
      setDvOptions(items);
    } catch (e) {
      console.warn(e);
    }
  };

  const onSelectDv = (val, option) => {
    const dv = option?.raw;
    if (!dv) return;
    if (selectedDv.some((x) => x.dichVuId === dv.DichVuId)) {
      message.info("Dịch vụ này đã có trong danh sách");
      setDvSearchKey("");
      return;
    }
    setSelectedDv((prev) => [
      ...prev,
      {
        dichVuId: dv.DichVuId,
        maDichVu: dv.MaDichVu,
        tenDichVu: dv.TenDichVu,
        soLuong: 1,
        donGia: 0,
      },
    ]);
    setDvSearchKey("");
    setDvOptions([]);
  };

  const updateDvField = (id, field, val) => {
    setSelectedDv((prev) =>
      prev.map((x) => (x.dichVuId === id ? { ...x, [field]: val } : x)),
    );
  };

  const removeDv = (id) =>
    setSelectedDv((prev) => prev.filter((x) => x.dichVuId !== id));

  const tongTien = useMemo(
    () =>
      selectedDv.reduce(
        (sum, x) => sum + (Number(x.donGia) || 0) * (Number(x.soLuong) || 0),
        0,
      ),
    [selectedDv],
  );

  const reloadSavedCls = useCallback(async () => {
    if (!tiepNhan?.tiepNhanId) return;
    try {
      const res = await http.get(`${BASE}/tiep-nhan/${tiepNhan.tiepNhanId}/cls`);
      setSavedDv(res?.data || []);
    } catch (e) {
      console.warn(e);
    }
  }, [tiepNhan]);

  useEffect(() => {
    reloadSavedCls();
  }, [reloadSavedCls]);

  const handleSubmitCls = async () => {
    if (!tiepNhan?.tiepNhanId) {
      message.warning("Cần tiếp nhận trước khi chỉ định CLS");
      return;
    }
    if (selectedDv.length === 0) {
      message.warning("Chưa chọn dịch vụ nào");
      return;
    }
    setSavingCls(true);
    try {
      const res = await http.post(`${BASE}/chi-dinh-cls`, {
        tiepNhanId: tiepNhan.tiepNhanId,
        benhNhanId: tiepNhan.benhNhanId,
        dichVu: selectedDv.map((x) => ({
          dichVuId: x.dichVuId,
          maDichVu: x.maDichVu,
          tenDichVu: x.tenDichVu,
          soLuong: x.soLuong,
          donGia: x.donGia,
        })),
      });
      const count = res?.data?.count ?? 0;
      message.success(`Đã chỉ định ${count} dịch vụ — phiếu ${res?.data?.soPhieuYeuCau}`);
      setSelectedDv([]);
      reloadSavedCls();
    } catch (e) {
      message.error(e?.message || "Lưu chỉ định thất bại");
    } finally {
      setSavingCls(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const tiLeBhyt = selectedDoiTuong
    ? selectedDoiTuong.Bhyt5Nam
      ? `${Math.round((selectedDoiTuong.TyLeBhyt || 0) * 100)}% → 100%`
      : `${Math.round((selectedDoiTuong.TyLeBhyt || 0) * 100)}%`
    : "—";

  const dvColumns = [
    {
      title: "Mã DV",
      dataIndex: "maDichVu",
      width: 100,
    },
    {
      title: "Tên dịch vụ",
      dataIndex: "tenDichVu",
      ellipsis: true,
    },
    {
      title: "SL",
      dataIndex: "soLuong",
      width: 80,
      render: (v, row) => (
        <InputNumber
          min={1}
          max={99}
          value={v}
          onChange={(val) => updateDvField(row.dichVuId, "soLuong", val)}
        />
      ),
    },
    {
      title: "Đơn giá (VNĐ)",
      dataIndex: "donGia",
      width: 140,
      render: (v, row) => (
        <InputNumber
          min={0}
          step={1000}
          value={v}
          formatter={(val) =>
            `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
          }
          parser={(val) => Number(`${val}`.replace(/,/g, "")) || 0}
          onChange={(val) => updateDvField(row.dichVuId, "donGia", val ?? 0)}
        />
      ),
    },
    {
      title: "",
      width: 50,
      render: (_, row) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeDv(row.dichVuId)}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: 16, paddingBottom: 80 }}>
      <PageHeader
        icon={<UserAddOutlined />}
        title="Đăng ký bệnh nhân đầy đủ"
        subtitle="Form đăng ký BN mới · BHYT · Lý do khám · BS chỉ định · Chỉ định CLS"
        tone="admin"
      />

      <Row gutter={16}>
        {/* Cột thông tin BN + tiếp nhận (full width — panel CLS đã ẩn) */}
        <Col xs={24} xl={24}>
          {/* Section 1: Tra cứu BN cũ */}
          <Card
            size="small"
            title={
              <Space>
                <SearchOutlined />
                <span>Tra cứu bệnh nhân theo mã y tế</span>
              </Space>
            }
            style={{ marginBottom: 12 }}
          >
            <Space.Compact style={{ width: "100%" }}>
              <Input
                placeholder="VD: 210009394"
                value={maYTeSearch}
                onChange={(e) => setMaYTeSearch(e.target.value)}
                onPressEnter={handleSearchBn}
              />
              <Button
                type="primary"
                icon={<SearchOutlined />}
                loading={searchingBn}
                onClick={handleSearchBn}
              >
                Tra cứu
              </Button>
            </Space.Compact>
            {foundBn && (
              <Alert
                style={{ marginTop: 8 }}
                showIcon
                type="success"
                message={`Đã tìm thấy BN — mã y tế ${foundBn.maYTe} (ID: ${foundBn.benhNhanId}). Form đã được fill sẵn.`}
                action={
                  <Button
                    size="small"
                    onClick={() => {
                      setFoundBn(null);
                      form.resetFields();
                      form.setFieldsValue({ doiTuongId: "DV" });
                      setMaYTeSearch("");
                    }}
                  >
                    Bỏ chọn
                  </Button>
                }
              />
            )}
          </Card>

          {/* Section 2: Form đầy đủ */}
          <Form layout="vertical" form={form} requiredMark={false}>
            <Card
              size="small"
              title={
                <Space>
                  <IdcardOutlined />
                  <span>Thông tin bệnh nhân</span>
                </Space>
              }
              style={{ marginBottom: 12 }}
            >
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
                  <Form.Item label="Giới tính" name="gioiTinh">
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
                  <Form.Item label="Ngày sinh đầy đủ" name="ngaySinh">
                    <DatePicker
                      style={{ width: "100%" }}
                      format="DD/MM/YYYY"
                      placeholder="dd/mm/yyyy"
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item label="CCCD/CMND" name="cccd">
                    <Input placeholder="12 số" maxLength={20} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item label="Số điện thoại" name="soDienThoai">
                    <Input placeholder="0935..." maxLength={15} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Dân tộc" name="danToc">
                    <Select
                      placeholder="--"
                      options={DAN_TOC.map((x) => ({ value: x, label: x }))}
                      showSearch
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Nghề nghiệp" name="ngheNghiep">
                    <Select
                      placeholder="--"
                      options={NGHE_NGHIEP.map((x) => ({
                        value: x,
                        label: x,
                      }))}
                      showSearch
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Nhóm máu" name="nhomMau">
                    <Select
                      placeholder="--"
                      options={NHOM_MAU.map((x) => ({ value: x, label: x }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Tỉnh/TP" name="tinh">
                    <Select
                      placeholder="--"
                      options={TINH_THANH.map((x) => ({
                        value: x,
                        label: x,
                      }))}
                      showSearch
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item label="Phường/Xã" name="phuongXa">
                    <Select
                      placeholder="--"
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
              </Row>
            </Card>

            {/* Section 3: BHYT panel */}
            <Card
              size="small"
              title={
                <Space>
                  <SafetyCertificateOutlined />
                  <span>Thông tin BHYT</span>
                </Space>
              }
              style={{ marginBottom: 12 }}
            >
              <Row gutter={12}>
                <Col xs={12} md={8}>
                  <Form.Item
                    label="Đối tượng"
                    name="doiTuongId"
                    rules={[{ required: true, message: "Chọn đối tượng" }]}
                  >
                    <Select
                      placeholder="--"
                      options={doiTuongs.map((d) => ({
                        value: d.Ma,
                        label: `${d.Ma} — ${d.TenDoiTuong}`,
                      }))}
                      onChange={() => form.validateFields()}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item label="Tỷ lệ %">
                    <Input value={tiLeBhyt} readOnly />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Số thẻ BHYT"
                    name="soBHYT"
                    rules={[
                      {
                        max: 50,
                        message: "Tối đa 50 ký tự",
                      },
                    ]}
                  >
                    <Input placeholder="VD: GD4484820..." maxLength={50} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Hiệu lực từ" name="bhytTuNgay">
                    <DatePicker
                      style={{ width: "100%" }}
                      format="DD/MM/YYYY"
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Hiệu lực đến" name="bhytDenNgay">
                    <DatePicker
                      style={{ width: "100%" }}
                      format="DD/MM/YYYY"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Section 4: Tiếp nhận */}
            <Card
              size="small"
              title={
                <Space>
                  <FileAddOutlined />
                  <span>Tiếp nhận</span>
                </Space>
              }
              style={{ marginBottom: 12 }}
            >
              <Row gutter={12}>
                {/* "Nơi tiếp nhận" + "BS chỉ định" ĐÃ ẨN: hàng đợi Khám là POOLED —
                    phòng + bác sĩ được gán LÚC GỌI, chọn ở đây không có tác dụng.
                    Backend mặc định phòng khám (sẽ ghi đè khi bác sĩ gọi). Chỉ giữ
                    "Lý do khám" (prefill sang bệnh án của bác sĩ). */}
                <Col xs={24}>
                  <Form.Item label="Lý do khám" name="lyDoKham">
                    <Input.TextArea
                      rows={2}
                      placeholder="VD: Đau ngực 3 ngày, sốt cao..."
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Space>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={savingTn}
                  onClick={handleSubmitTiepNhan}
                  disabled={!!tiepNhan}
                >
                  {tiepNhan ? "Đã tiếp nhận" : "Tiếp nhận"}
                </Button>
                {tiepNhan && (
                  <>
                    <Tag color="green" style={{ fontSize: 13 }}>
                      Phiếu: {tiepNhan.soTiepNhan}
                    </Tag>
                    <Tag color="blue" style={{ fontSize: 13 }}>
                      Mã y tế: {tiepNhan.maYTe}
                    </Tag>
                    <Button type="primary" ghost onClick={() => setQrOpen(true)}>
                      📱 QR theo dõi
                    </Button>
                    <Button
                      onClick={() => {
                        setTiepNhan(null);
                        setFoundBn(null);
                        setSelectedDv([]);
                        setSavedDv([]);
                        form.resetFields();
                        form.setFieldsValue({ doiTuongId: "DV" });
                        setMaYTeSearch("");
                      }}
                    >
                      Bệnh nhân mới
                    </Button>
                  </>
                )}
              </Space>

              <Modal
                open={qrOpen}
                onCancel={() => setQrOpen(false)}
                onOk={() => setQrOpen(false)}
                okText="Đồng ý"
                cancelButtonProps={{ style: { display: "none" } }}
                centered
                width={420}
                title={
                  tiepNhan?.daTiepNhanTruoc
                    ? "Bệnh nhân đã được tiếp nhận"
                    : "Tiếp nhận thành công"
                }
              >
                {tiepNhan && (
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}
                    >
                      {tiepNhan.maYTe} · Khu Khám Bệnh
                    </div>
                    <div
                      style={{
                        fontSize: 56,
                        fontWeight: 900,
                        color: "#1677ff",
                        lineHeight: 1,
                      }}
                    >
                      {tiepNhan.hangDoiSTT || tiepNhan.soThuTu}
                    </div>
                    <div
                      style={{
                        display: "inline-block",
                        padding: 12,
                        marginTop: 12,
                        background: "#fff",
                        border: "1px solid #d6e4ff",
                        borderRadius: 8,
                      }}
                    >
                      <QRCodeSVG
                        size={170}
                        level="M"
                        value={
                          tiepNhan.benhNhanId
                            ? `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/track?bn=${tiepNhan.benhNhanId}`
                            : `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/track?id=${tiepNhan.hangDoiPhongBanId}`
                        }
                      />
                    </div>
                    <div
                      style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}
                    >
                      📱 Quét mã QR bằng điện thoại để theo dõi số thứ tự và nhận
                      thông báo khi sắp đến lượt.
                    </div>
                  </div>
                )}
              </Modal>
            </Card>
          </Form>
        </Col>

        {/* Panel "Chỉ định CLS" ở bước TIẾP NHẬN đã ẨN — theo mô hình
            doctor-transfer, CLS do BÁC SĨ chỉ định lúc khám (trang Bệnh án +
            Chỉ định), không phải lúc tiếp nhận. Giữ JSX dạng {false && (...)}
            để rollback nếu cần dùng cho ca có chỉ định sẵn. */}
        {false && (
        <Col xs={24} xl={10}>
          <Card
            size="small"
            title={
              <Space>
                <MedicineBoxOutlined />
                <span>Chỉ định cận lâm sàng (CLS)</span>
              </Space>
            }
          >
            {!tiepNhan ? (
              <Alert
                type="info"
                showIcon
                message="Cần hoàn tất bước Tiếp nhận trước khi chỉ định dịch vụ."
              />
            ) : (
              <>
                <Text type="secondary">
                  Tìm và thêm dịch vụ vào phiếu chỉ định cho BN{" "}
                  <b>{tiepNhan.maYTe}</b> (TN #{tiepNhan.tiepNhanId})
                </Text>
                <div style={{ marginTop: 8 }}>
                  <AutoComplete
                    style={{ width: "100%" }}
                    value={dvSearchKey}
                    options={dvOptions}
                    onSearch={onSearchDv}
                    onSelect={onSelectDv}
                    onChange={(v) => setDvSearchKey(v)}
                    placeholder="Gõ tên/mã dịch vụ (vd: 'siêu âm', '0021')"
                  >
                    <Input prefix={<SearchOutlined />} />
                  </AutoComplete>
                </div>

                <Table
                  size="small"
                  style={{ marginTop: 12 }}
                  pagination={false}
                  rowKey="dichVuId"
                  dataSource={selectedDv}
                  columns={dvColumns}
                  locale={{
                    emptyText: "Chưa chọn dịch vụ nào — search ở trên để thêm.",
                  }}
                  summary={() =>
                    selectedDv.length > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3}>
                          <Text strong>Tổng tiền</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>
                          <Text strong>
                            {tongTien.toLocaleString("vi-VN")} đ
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} />
                      </Table.Summary.Row>
                    ) : null
                  }
                />

                <Space style={{ marginTop: 12 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    loading={savingCls}
                    onClick={handleSubmitCls}
                    disabled={selectedDv.length === 0}
                  >
                    Lưu chỉ định ({selectedDv.length})
                  </Button>
                  <Button
                    onClick={() => setSelectedDv([])}
                    disabled={selectedDv.length === 0}
                  >
                    Xóa hết
                  </Button>
                </Space>

                {savedDv.length > 0 && (
                  <>
                    <Divider style={{ margin: "16px 0 8px" }} />
                    <Title level={5} style={{ margin: 0 }}>
                      Đã chỉ định ({savedDv.length})
                    </Title>
                    <Table
                      size="small"
                      style={{ marginTop: 8 }}
                      pagination={false}
                      rowKey="DvYeuCauId"
                      dataSource={savedDv}
                      columns={[
                        {
                          title: "Phiếu",
                          dataIndex: "SoPhieuYeuCau",
                          width: 110,
                        },
                        {
                          title: "Mã DV",
                          dataIndex: "MaDichVu",
                          width: 90,
                        },
                        {
                          title: "Tên dịch vụ",
                          dataIndex: "TenDichVu",
                          ellipsis: true,
                        },
                        {
                          title: "Trạng thái",
                          dataIndex: "TrangThai",
                          width: 100,
                          render: (v) => <Tag>{v}</Tag>,
                        },
                      ]}
                    />
                  </>
                )}
              </>
            )}
          </Card>
        </Col>
        )}
      </Row>
    </div>
  );
}
