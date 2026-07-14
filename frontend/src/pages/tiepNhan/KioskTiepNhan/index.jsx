import { LogoutOutlined, ScanOutlined, SmileOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  Layout,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import FaceCaptureModal from "../../../component/FaceCaptureModal";
import NumericKeyboard from "../../../component/NumericKeyboard";
import { logout } from "../../../store/slices/authSlice";
import http from "../../../util/httpClient";
import "./KioskTiepNhan.scss";

const { Header, Content } = Layout;
const { Text } = Typography;

/**
 * Kiosk tiếp nhận — 2 luồng tồn tại song song:
 *
 *   A) LẤY SỐ NHANH (sidebar trái) — bệnh nhân không có hồ sơ, chỉ cần số thứ tự.
 *      Chỉ cần (tùy chọn) tick ưu tiên rồi bấm nút vàng.
 *
 *   B) TIẾP NHẬN ĐẦY ĐỦ (panel phải) — bệnh nhân có mã y tế / BHYT / CCCD hoặc
 *      đã đăng ký khuôn mặt; 4 bước:
 *        1. Nhận dạng bệnh nhân (quét / face / nhập tay)
 *        2. Xác nhận thông tin eHospital + kiểm tra thông tuyến BHXH
 *        3. Chọn gói khám + ưu tiên + thu tiền
 *        4. Xác nhận tiếp nhận → nhận số thứ tự
 *
 *  State `uuTien` + `loaiUuTienSelected` dùng chung cho cả 2 luồng.
 */
const KioskTiepNhan = () => {
  // ── STATE
  const [maYTe, setMaYTe] = useState("");
  const [benhNhan, setBenhNhan] = useState(null);
  const [thongTuyen, setThongTuyen] = useState("");

  const [dichVuOptions, setDichVuOptions] = useState([]);
  const [dichVuSelected, setDichVuSelected] = useState(null);

  const [uuTien, setUuTien] = useState(false);
  const [loaiUuTienOptions, setLoaiUuTienOptions] = useState([]);
  const [loaiUuTienSelected, setLoaiUuTienSelected] = useState(null);

  // Kiosk tự phục vụ KHÔNG thu tiền tại chỗ → luôn "thu sau" (BN trả ở
  // quầy viện phí sau khi khám). Bỏ lựa chọn thu trước/sau khỏi kiosk.
  const thuTienSau = true;
  const [submitting, setSubmitting] = useState(false);

  const [hangDoiList, setHangDoiList] = useState([]);
  const [showKeyboard, setShowKeyboard] = useState(false);

  const [loadingInit, setLoadingInit] = useState(false);
  const [faceCaptureOpen, setFaceCaptureOpen] = useState(false);
  const [waitEstimate, setWaitEstimate] = useState(null);
  const [faceAiStatus, setFaceAiStatus] = useState({ available: true, message: "" });

  const [modal, setModal] = useState({ open: false, title: "", content: "" });

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login", { replace: true });
  };

  // Chỉ hiển thị 1 queue chính ở sidebar (queue mặc định FieldCode=1, fallback queue đầu).
  const kioskQueueButtons = (() => {
    if (!Array.isArray(hangDoiList) || hangDoiList.length === 0) return [];
    const preferred = hangDoiList.find((item) => String(item?.FieldCode) === "1");
    return preferred ? [preferred] : [hangDoiList[0]];
  })();
  const defaultHangDoiId = Number(kioskQueueButtons?.[0]?.FieldCode || 0);

  const openModal = (content, title = "THÔNG BÁO") =>
    setModal({ open: true, title, content, qr: null });
  const openModalQr = (qrPayload, content, title = "ĐÃ LẤY SỐ THÀNH CÔNG") =>
    setModal({ open: true, title, content, qr: qrPayload });
  const closeModal = () =>
    setModal((m) => ({ ...m, open: false, content: "", qr: null }));

  useEffect(() => {
    const initData = async () => {
      try {
        setLoadingInit(true);
        const [hangdoiRes, loaiUuTienRes, dichVuRes] = await Promise.all([
          http.get("/kiosk/queue-list"),
          http.get("/kiosk/loai-uu-tien"),
          http.get("/kiosk/loai-dich-vu"),
        ]);
        if (hangdoiRes?.data) setHangDoiList(hangdoiRes.data);
        if (loaiUuTienRes?.data) setLoaiUuTienOptions(loaiUuTienRes.data || []);
        if (dichVuRes?.data) setDichVuOptions(dichVuRes.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingInit(false);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    const loadFaceAiHealth = async () => {
      try {
        const res = await http.get("/kiosk/face-ai-health");
        setFaceAiStatus({
          available: !!res?.data?.available,
          message: res?.data?.message || "",
        });
      } catch {
        setFaceAiStatus({ available: false, message: "Không kết nối được AI service" });
      }
    };
    loadFaceAiHealth();
    const timer = setInterval(loadFaceAiHealth, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setDichVuSelected(dichVuOptions?.[0]?.DICHVU_ID || null);
  }, [dichVuOptions]);

  // Tự pull wait estimate khi có queue mặc định hoặc khi ưu tiên thay đổi.
  useEffect(() => {
    if (!defaultHangDoiId) return undefined;
    const fetchEstimate = async () => {
      try {
        const res = await http.get("/kiosk/wait-estimate", {
          hangDoiId: defaultHangDoiId,
          priorityWeight: uuTien ? 2 : 1,
        });
        setWaitEstimate(res?.data || null);
      } catch {
        // ignore
      }
    };
    fetchEstimate();
    const t = setInterval(fetchEstimate, 30000);
    return () => clearInterval(t);
  }, [defaultHangDoiId, uuTien]);

  // ── HANDLERS
  const handleSearchMaYTe = async () => {
    if (!maYTe) {
      openModal("Chưa nhập mã y tế / CCCD");
      return;
    }
    const checkRes = await http.get("/kiosk/check-ma", { maYTe });
    const data = checkRes?.data?.length > 0 ? checkRes.data[0] : null;

    if (!data || !data.GhiChu_id) {
      setBenhNhan(data || null);
      setThongTuyen("");
      return;
    }
    if (data.GhiChu_id == "1" || data.GhiChu_id == "2") {
      openModal((data.GhiChu_ThongTuyen || "").toUpperCase());
      setBenhNhan(null);
      setThongTuyen("");
      return;
    }
    setBenhNhan({
      BenhNhan_Id: data.BenhNhan_Id,
      TenBenhNhan: data.TenBenhNhan,
      NamSinh: data.NamSinh,
      GioiTinh: data.GIOITINH,
      SoDienThoai: data.SODIENTHOAI,
      DiaChi: data.DIACHI,
    });
    setThongTuyen("");
    setMaYTe(data.MaYTe || "");
  };

  const handleKeyboardInput = (val) => {
    if (val === "backspace") setMaYTe((prev) => prev.slice(0, -1));
    else if (val === "enter") handleSearchMaYTe();
    else setMaYTe((prev) => prev + val);
  };

  const handleClickHangDoi = async (hangDoi) => {
    if (submitting) return;
    if (uuTien && !loaiUuTienSelected) {
      openModal("Vui lòng chọn loại ưu tiên");
      return;
    }
    setSubmitting(true);
    try {
      const res = await http.post("/kiosk/queue-checkin", {
        hangDoiId: hangDoi.FieldCode,
        uuTien: uuTien ? 1 : 0,
        loaiSUuTien: uuTien ? loaiUuTienSelected : null,
      });
      if (!res?.data || !Array.isArray(res.data) || res.data.length === 0) {
        openModal("Không tạo được số thứ tự. Vui lòng thử lại.");
        return;
      }
      const row = res.data[0] || {};
      // Ưu tiên SoThuTuDayDu — số CHÍNH THỨC (có prefix KyTuSTT, vd "1006")
      // mà quầy + tivi + loa đều dùng. STT thuần (6) chỉ là seq nội bộ.
      const sttCap = row.SoThuTuDayDu ?? row.SoThuTu ?? row.STT;
      if (sttCap) {
        openModalQr(
          {
            hangDoiId: hangDoi.FieldCode,
            id: row.HangDoiPhongBan_Id ?? row.HangDoiPhongBanId ?? null,
            stt: Number(String(sttCap).replace(/\D/g, "")) || sttCap,
            sttDisplay: String(sttCap),
            tenHangDoi: hangDoi.FieldName || "Tiếp nhận",
          },
          "Vui lòng giữ phiếu để nghe gọi. Bạn có thể quét mã QR bên dưới để theo dõi STT trên điện thoại.",
        );
      } else {
        openModal("Đã ghi nhận. Vui lòng lấy phiếu số thứ tự.");
      }
      setUuTien(false);
      setLoaiUuTienSelected(null);
    } catch (err) {
      console.error(err);
      openModal("Không gửi được dữ liệu tới server.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFaceCheckIn = () => {
    if (!defaultHangDoiId) {
      openModal("Chưa có cấu hình hàng đợi để nhận diện check-in.");
      return;
    }
    setFaceCaptureOpen(true);
  };

  const handleFaceCaptureSuccess = (data) => {
    setWaitEstimate(data.waitEstimate || null);
    const q = data.queue?.[0];
    const sttCap = q?.SoThuTuDayDu ?? q?.SoThuTu ?? q?.STT;
    const status = data?.fallbackUsed
      ? "Đã tiếp nhận (check-in bằng mã)"
      : data?.daTiepNhanTruoc
        ? "Bệnh nhân đã được tiếp nhận"
        : "Nhận diện thành công — đã tiếp nhận";
    if (q && sttCap) {
      // Heading GỌN 2 dòng: trạng thái + tên BN. STT / khu khám / QR / hướng dẫn
      // đã nằm trong THẺ QR bên dưới nên KHÔNG lặp lại ở đây (tránh rối).
      const ten = q.HoTenBenhNhan || data.personId;
      const baseMsg = `${status}\n${ten}${q.Tuoi ? ` · ${q.Tuoi} tuổi` : ""}`;
      openModalQr(
        {
          hangDoiId: q.HangDoi_Id ?? q.HangDoiId ?? 3,
          bn: null,
          id: q.HangDoiPhongBan_Id ?? q.HangDoiPhongBanId ?? null,
          stt: Number(String(sttCap).replace(/\D/g, "")) || sttCap,
          sttDisplay: String(sttCap),
          tenHangDoi: q.TenHangDoi || "Khu Khám Bệnh",
        },
        baseMsg,
        data?.daTiepNhanTruoc ? "ĐÃ TIẾP NHẬN" : "TIẾP NHẬN THÀNH CÔNG",
      );
      resetUi();
    } else {
      openModal(`${status}: ${data.personId}`);
    }
  };

  const handleXacNhanTiepNhan = async () => {
    if (submitting) return;
    if (!benhNhan || !benhNhan.BenhNhan_Id) {
      openModal("Chưa có thông tin bệnh nhân — vui lòng nhận dạng ở bước 1");
      return;
    }
    if (uuTien && !loaiUuTienSelected) {
      openModal("Vui lòng chọn loại ưu tiên");
      return;
    }
    setSubmitting(true);
    try {
      const res = await http.post("/kiosk/tu-dong-tiep-nhan", {
        benhNhanId: benhNhan.BenhNhan_Id,
        dichVuId: dichVuSelected,
        uuTien: uuTien ? 1 : 0,
        thuTienSau: thuTienSau ? 1 : 0,
        loaiUuTienText: uuTien ? loaiUuTienSelected : null,
      });
      if (!res?.data || res.data.length === 0) {
        openModal("Tiếp nhận thất bại, vui lòng thử lại.");
        return;
      }
      const data = res.data[0];
      const sttCap = data.SoThuTuDayDu ?? data.SoThuTu ?? data.STT;
      const hangDoiIdCap = data.HangDoi_Id ?? data.HangDoiId ?? 3;
      const baseMsg =
        `Người bệnh: ${data.HoTenBenhNhan || ""} — ${data.Tuoi || ""} tuổi · ${data.TenHangDoi || ""}`.toUpperCase();
      if (sttCap) {
        openModalQr(
          {
            hangDoiId: hangDoiIdCap,
            // Có BenhNhan_Id → QR theo HÀNH TRÌNH (app tự nhảy hàng đợi khám→CLS→...).
            bn: benhNhan?.BenhNhan_Id ?? null,
            id: data.HangDoiPhongBan_Id ?? data.HangDoiPhongBanId ?? null,
            stt: Number(String(sttCap).replace(/\D/g, "")) || sttCap,
            sttDisplay: String(sttCap),
            tenHangDoi: data.TenHangDoi || "Khu Khám Bệnh",
          },
          baseMsg,
          "TIẾP NHẬN THÀNH CÔNG",
        );
      } else {
        openModal(baseMsg);
      }
      resetUi();
    } catch (err) {
      console.error(err);
      openModal("Lỗi hệ thống, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetUi = () => {
    setMaYTe("");
    setBenhNhan(null);
    setThongTuyen("");
    setUuTien(false);
    setLoaiUuTienSelected(null);
    setDichVuSelected(dichVuOptions?.[0]?.DICHVU_ID || null);
  };

  // Kiosk công cộng: tự xóa form sau 60s không thao tác (tránh lộ thông tin
  // BN cho người kế tiếp).
  useEffect(() => {
    if (!benhNhan && !maYTe) return undefined;
    const t = setTimeout(() => resetUi(), 60000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benhNhan, maYTe]);

  if (loadingInit) return null;

  // Bước hiện tại — bước 1 chưa có BN, bước 2 có BN nhưng chưa xác nhận, bước 3 sẵn sàng XÁC NHẬN.
  const currentStep = !benhNhan ? 1 : 2;

  const StepNumber = ({ n }) => {
    const done = n < currentStep;
    const active = n === currentStep;
    return (
      <span
        style={{
          display: "inline-flex",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: done ? "#52c41a" : active ? "#1677ff" : "#cbd5e1",
          color: "#fff",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          marginRight: 8,
          fontSize: 13,
          boxShadow: active ? "0 0 0 4px rgba(22, 119, 255, 0.18)" : "none",
          transition: "all 0.2s",
        }}
      >
        {done ? "✓" : n}
      </span>
    );
  };

  return (
    <Layout className="kiosk-layout">
      <Header className="kiosk-header">
        <div className="kiosk-header-title">KIOSK ĐĂNG KÝ KHÁM TỰ ĐỘNG</div>
        <Button
          className="tivi-logout-btn"
          type="primary"
          shape="circle"
          icon={<LogoutOutlined />}
          onClick={handleLogout}
        />
      </Header>

      <Content className="kiosk-content">
        <Row className="kiosk-main-row" gutter={0}>
          {/* ── LUỒNG A: LẤY SỐ NHANH ───────────────────────────────────── */}
          <Col span={8} className="kiosk-left">
            <div className="kiosk-left-inner">
              <div className="kiosk-left-title">LẤY SỐ NHANH</div>
              <div style={{ color: "#cfd8e3", fontSize: 14, marginBottom: 16 }}>
                Dành cho bệnh nhân <strong>chưa có mã y tế</strong> — chỉ cần
                bấm nút dưới đây để nhận phiếu số thứ tự.
              </div>

              <div className="kiosk-queue-container">
                {kioskQueueButtons.map((item) => (
                  <Button
                    key={item.FieldCode}
                    className={`queue-btn ${String(item?.FieldCode) === "1" ? "blink" : ""}`}
                    onClick={() => handleClickHangDoi(item)}
                  >
                    {String(item?.FieldCode) === "1"
                      ? "BẤM VÀO ĐÂY\nĐỂ LẤY\nSỐ THỨ TỰ"
                      : item.FieldName}
                  </Button>
                ))}
                {kioskQueueButtons.length === 0 && (
                  <div className="scan-text">
                    Không tải được danh sách hàng đợi.
                  </div>
                )}
              </div>

              <div className="kiosk-priority-row">
                <Checkbox
                  checked={uuTien}
                  onChange={(e) => {
                    setUuTien(e.target.checked);
                    if (!e.target.checked) setLoaiUuTienSelected(null);
                  }}
                >
                  Bệnh nhân ưu tiên
                </Checkbox>
              </div>
              <div className="kiosk-priority-row">
                <Select
                  className="kiosk-priority-select"
                  options={loaiUuTienOptions.map((opt) => ({
                    value: opt.FieldName,
                    label: opt.FieldName,
                  }))}
                  value={loaiUuTienSelected}
                  onChange={setLoaiUuTienSelected}
                  placeholder="Chọn loại ưu tiên"
                  size="large"
                  disabled={!uuTien}
                />
              </div>

              {waitEstimate && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#fff",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  Chờ dự kiến: {waitEstimate.predictedMinutes} phút
                  <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.85 }}>
                    khoảng {waitEstimate.range} phút
                  </div>
                </div>
              )}

              <div className="kiosk-scan-box">
                <div className="scan-text">
                  QUÉT MÃ Y TẾ / THẺ BHYT / CCCD
                  <br />
                  TẠI KHE BÊN DƯỚI
                </div>
                <div className="scan-arrow" />
              </div>
            </div>
          </Col>

          {/* ── LUỒNG B: TIẾP NHẬN ĐẦY ĐỦ ───────────────────────────────── */}
          <Col span={16} className="kiosk-right">
            <div className="kiosk-right-inner" style={{ padding: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>
                TIẾP NHẬN ĐẦY ĐỦ
              </div>
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 8 }}>
                Dành cho bệnh nhân đã có hồ sơ. Hoàn thành 3 bước bên dưới.
              </div>

              {/* Bước 1 — Nhận dạng */}
              <Card
                size="small"
                title={
                  <span>
                    <StepNumber n={1} />
                    Nhận dạng bệnh nhân
                  </span>
                }
                style={{ marginBottom: 8 }}
              >
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    autoFocus
                    size="large"
                    value={maYTe}
                    onChange={(e) => setMaYTe(e.target.value)}
                    onPressEnter={handleSearchMaYTe}
                    placeholder="Mã y tế / Thẻ BHYT / CCCD"
                    prefix={<ScanOutlined />}
                  />
                  <Button size="large" onClick={() => setShowKeyboard((s) => !s)}>
                    Bàn phím
                  </Button>
                  <Button size="large" type="primary" onClick={handleSearchMaYTe}>
                    Tìm
                  </Button>
                </Space.Compact>

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Button
                    icon={<SmileOutlined />}
                    onClick={handleFaceCheckIn}
                    disabled={!faceAiStatus.available}
                  >
                    Check-in bằng khuôn mặt
                  </Button>
                  <Tag color={faceAiStatus.available ? "green" : "red"}>
                    AI: {faceAiStatus.available ? "Sẵn sàng" : "Không khả dụng"}
                  </Tag>
                  <Button
                    onClick={() => {
                      setMaYTe("");
                      setBenhNhan(null);
                      setThongTuyen("");
                    }}
                  >
                    Xóa / Nhập lại
                  </Button>
                </div>
              </Card>

              {/* Bước 2 — Thông tin bệnh nhân */}
              <Card
                size="small"
                title={
                  <span>
                    <StepNumber n={2} />
                    Thông tin bệnh nhân
                  </span>
                }
                style={{ marginBottom: 8 }}
              >
                {!benhNhan ? (
                  <Alert
                    type="info"
                    showIcon
                    message="Hoàn thành bước 1 để tự động điền thông tin bệnh nhân."
                  />
                ) : (
                  <>
                    <Row gutter={[8, 6]}>
                      <Col span={12}>
                        <div style={labelStyle}>Họ và tên</div>
                        <Input size="small" value={benhNhan.TenBenhNhan || ""} readOnly />
                      </Col>
                      <Col span={6}>
                        <div style={labelStyle}>Năm sinh</div>
                        <Input size="small" value={benhNhan.NamSinh || ""} readOnly />
                      </Col>
                      <Col span={6}>
                        <div style={labelStyle}>Giới tính</div>
                        <Input size="small" value={benhNhan.GioiTinh || ""} readOnly />
                      </Col>
                      <Col span={12}>
                        <div style={labelStyle}>Điện thoại</div>
                        <Input size="small" value={benhNhan.SoDienThoai || ""} readOnly />
                      </Col>
                      <Col span={12}>
                        <div style={labelStyle}>Địa chỉ</div>
                        <Input size="small" value={benhNhan.DiaChi || ""} readOnly />
                      </Col>
                    </Row>
                  </>
                )}
              </Card>

              {/* Bước 3 — Dịch vụ + ưu tiên + xác nhận */}
              <Card
                size="small"
                title={
                  <span>
                    <StepNumber n={3} />
                    Gói khám & xác nhận
                  </span>
                }
              >
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <div style={labelStyle}>Gói khám</div>
                    <Select
                      style={{ width: "100%" }}
                      size="large"
                      value={dichVuSelected}
                      onChange={setDichVuSelected}
                      options={dichVuOptions.map((opt) => ({
                        value: opt.DICHVU_ID,
                        label: opt.TENDICHVU,
                      }))}
                      placeholder="Chọn gói khám"
                    />
                  </Col>
                  <Col span={12}>
                    <Checkbox
                      checked={uuTien}
                      onChange={(e) => {
                        setUuTien(e.target.checked);
                        if (!e.target.checked) setLoaiUuTienSelected(null);
                      }}
                    >
                      Bệnh nhân ưu tiên
                    </Checkbox>
                  </Col>
                  <Col span={12}>
                    <Select
                      style={{ width: "100%" }}
                      size="large"
                      options={loaiUuTienOptions.map((opt) => ({
                        value: opt.FieldName,
                        label: opt.FieldName,
                      }))}
                      value={loaiUuTienSelected}
                      onChange={setLoaiUuTienSelected}
                      placeholder="Loại ưu tiên"
                      disabled={!uuTien}
                    />
                  </Col>
                </Row>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 10,
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {waitEstimate ? (
                    <Tag color="blue" style={{ fontSize: 14, padding: "6px 12px" }}>
                      Chờ dự kiến: {waitEstimate.predictedMinutes} phút (
                      {waitEstimate.range})
                    </Tag>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="primary"
                    size="large"
                    style={{ minWidth: 220, height: 46, fontSize: 16, fontWeight: 700 }}
                    disabled={!benhNhan || submitting}
                    loading={submitting}
                    onClick={handleXacNhanTiepNhan}
                  >
                    XÁC NHẬN TIẾP NHẬN
                  </Button>
                </div>
              </Card>
            </div>

            {showKeyboard && (
              <NumericKeyboard
                onInput={handleKeyboardInput}
                onClose={() => setShowKeyboard(false)}
              />
            )}
          </Col>
        </Row>
      </Content>

      <Modal
        open={modal.open}
        onCancel={closeModal}
        onOk={closeModal}
        footer={[
          <Button key="ok" type="primary" size="large" onClick={closeModal}>
            ĐỒNG Ý
          </Button>,
        ]}
        centered
        className="kiosk-modal"
      >
        <Text className="kiosk-modal-text" style={{ whiteSpace: "pre-line" }}>
          {modal.content}
        </Text>
        {modal.qr && (
          <div
            style={{
              marginTop: 20,
              padding: 18,
              background: "#f0f5ff",
              borderRadius: 12,
              border: "2px solid #1677ff",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#003a8c",
                marginBottom: 8,
                letterSpacing: 1,
              }}
            >
              SỐ THỨ TỰ CỦA BẠN
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: "#1677ff",
                lineHeight: 1,
                marginBottom: 8,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {modal.qr.sttDisplay}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#475569",
                marginBottom: 12,
              }}
            >
              {modal.qr.tenHangDoi}
            </div>
            <div
              style={{
                display: "inline-block",
                padding: 12,
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #d6e4ff",
              }}
            >
              <QRCodeSVG
                size={160}
                level="M"
                value={
                  modal.qr.bn
                    ? `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/track?bn=${modal.qr.bn}`
                    : modal.qr.id
                      ? `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/track?id=${modal.qr.id}`
                      : `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/track/${modal.qr.hangDoiId}/${modal.qr.stt}`
                }
              />
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                marginTop: 10,
                lineHeight: 1.4,
              }}
            >
              📱 Quét mã QR bằng điện thoại để theo dõi STT
              <br />
              và nhận thông báo khi sắp đến lượt.
            </div>
          </div>
        )}
      </Modal>

      <FaceCaptureModal
        open={faceCaptureOpen}
        onClose={() => setFaceCaptureOpen(false)}
        onSuccess={handleFaceCaptureSuccess}
        hangDoiId={defaultHangDoiId}
        uuTien={uuTien ? 1 : 0}
        loaiUuTien={uuTien ? loaiUuTienSelected : null}
        priorityWeight={uuTien ? 2 : 1}
        manualPatientCode={maYTe || null}
        dichVuId={dichVuSelected || null}
      />
    </Layout>
  );
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 2,
};

export default KioskTiepNhan;
