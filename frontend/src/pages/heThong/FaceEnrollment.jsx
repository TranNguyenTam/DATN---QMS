import {
  CameraOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  ExclamationCircleFilled,
  FileImageOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  ScanOutlined,
  UploadOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Progress,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
  message
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import FaceCameraPreview from "../../component/FaceCameraPreview";
import PageHeader from "../../component/PageHeader";
import useFaceCamera from "../../hooks/useFaceCamera";
import http from "../../util/httpClient";

const TARGET_SHOTS = 3; // số ảnh khuyến nghị / BN — giảm FRR

/**
 * Trang đăng ký khuôn mặt — 2 mode (khớp với Computer Vision project):
 *
 *   1. Upload file (default): chọn nhiều ảnh từ máy / điện thoại — hỗ trợ
 *      JPG/PNG/HEIC. Đây là use case chính: BN có ảnh sẵn (CCCD, hộ chiếu,
 *      ảnh do nhân viên chụp trước). Backend ai-face có HEIC decoder.
 *
 *   2. Chụp realtime: bật camera Hikvision (mặc định nếu có) hoặc webcam
 *      USB → chụp 3 góc. Dành cho trường hợp BN đến tận quầy đăng ký.
 *
 *   Sau khi có ảnh → POST tuần tự `/face/enroll` (backend append, không
 *   revoke ảnh cũ).
 */
export default function FaceEnrollment() {
  const [form] = Form.useForm();
  const [mode, setMode] = useState("upload"); // "upload" | "capture"
  const [webcamOn, setWebcamOn] = useState(false); // chỉ enable khi mode capture
  const cam = useFaceCamera({ enabled: mode === "capture" && webcamOn });
  const [shots, setShots] = useState([]); // [{ blob, url, name }]
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [patients, setPatients] = useState([]);
  const [kw, setKw] = useState("");
  const [statusFilter, setStatusFilter] = useState("unenrolled");
  const [loadingList, setLoadingList] = useState(false);
  const [healthy, setHealthy] = useState(null);

  // Khi switch tab → reset webcamOn cho capture mode auto-start
  useEffect(() => {
    if (mode === "capture") setWebcamOn(true);
    else setWebcamOn(false);
  }, [mode]);

  const loadHealth = useCallback(async () => {
    try {
      const res = await http.get("/face/health");
      setHealthy(res?.data?.available ?? false);
    } catch {
      setHealthy(false);
    }
  }, []);

  const loadPatients = useCallback(async (keyword, status) => {
    setLoadingList(true);
    try {
      const res = await http.get("/face/patients", {
        keyword: keyword || "",
        status: status || "all",
      });
      setPatients(res?.data || []);
    } catch {
      message.error("Không tải được danh sách bệnh nhân");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const t = setInterval(loadHealth, 30000);
    return () => clearInterval(t);
  }, [loadHealth]);

  // Tải danh sách BN theo bộ lọc trạng thái (đổi filter → tải lại; tìm kiếm gọi tay).
  useEffect(() => {
    loadPatients(kw, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, loadPatients]);

  // Revoke object URL CHỈ khi unmount (lấy shots mới nhất qua ref). KHÔNG để [shots]
  // làm dependency — sẽ revoke URL của list CŨ mỗi lần thêm ảnh → thumbnail vỡ.
  // (Khi xoá từng ảnh / xoá hết đã revoke riêng trong handleRemoveShot/handleClearAll.)
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(
    () => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)),
    [],
  );

  // ─── Capture mode ─────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cam.ready) {
      return message.warning(
        cam.source === "usb"
          ? "Bật webcam trước khi chụp"
          : "Đang kết nối Hikvision…",
      );
    }
    if (shots.length >= TARGET_SHOTS) {
      return message.info(
        `Đã đủ ${TARGET_SHOTS} ảnh. Bấm Đăng ký để hoàn tất.`,
      );
    }
    try {
      const blob = await cam.capture();
      setShots((prev) => [
        ...prev,
        {
          blob,
          url: URL.createObjectURL(blob),
          name: `capture-${Date.now()}.jpg`,
        },
      ]);
    } catch (e) {
      message.error(e?.message || "Chụp thất bại");
    }
  };

  // ─── Upload mode ──────────────────────────────────────────────────────
  // beforeUpload: lưu file vào shots, KHÔNG upload ngay (chờ bấm Đăng ký).
  const handleBeforeUpload = (file) => {
    const isHeic =
      /image\/hei[cf]/i.test(file.type || "") ||
      /\.(heic|heif)$/i.test(file.name || "");
    const isImage = file.type?.startsWith("image/") || isHeic;
    if (!isImage) {
      message.error(`${file.name} không phải ảnh hợp lệ`);
      return Upload.LIST_IGNORE;
    }

    if (isHeic) {
      // HEIC (iPhone) trình duyệt KHÔNG render được → chuyển sang JPEG ngay trên
      // client để XEM TRƯỚC THẬT + upload chuẩn. heic2any lazy-load (chỉ tải khi cần).
      const jpgName =
        (file.name || `heic-${Date.now()}`).replace(/\.(heic|heif)$/i, "") + ".jpg";
      const key = `heic-${Date.now()}`;
      message.loading({ key, content: `Đang chuyển ${file.name}…`, duration: 0 });
      (async () => {
        try {
          const heic2any = (await import("heic2any")).default;
          const out = await heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.9,
          });
          const jpeg = Array.isArray(out) ? out[0] : out;
          const jpegFile = new File([jpeg], jpgName, { type: "image/jpeg" });
          setShots((prev) => [
            ...prev,
            { blob: jpegFile, url: URL.createObjectURL(jpegFile), name: jpgName },
          ]);
          message.destroy(key);
        } catch (e) {
          message.error({
            key,
            content: `Không chuyển được ảnh HEIC: ${e?.message || "lỗi"}`,
          });
        }
      })();
      return Upload.LIST_IGNORE;
    }

    setShots((prev) => [
      ...prev,
      { blob: file, url: URL.createObjectURL(file), name: file.name },
    ]);
    return Upload.LIST_IGNORE; // không add vào internal list của AntD Upload
  };

  // ─── Shared ───────────────────────────────────────────────────────────
  const handleRemoveShot = (idx) => {
    setShots((prev) => {
      const next = prev.slice();
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  const handleClearAll = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (shots.length === 0) {
        message.warning("Chọn / chụp ít nhất 1 ảnh trước khi đăng ký");
        return;
      }
      setSubmitting(true);
      setProgress({ current: 0, total: shots.length });

      let success = 0;
      let lastMessage = "";
      for (let i = 0; i < shots.length; i++) {
        setProgress({ current: i + 1, total: shots.length });
        const fd = new FormData();
        fd.append("maYTe", values.maYTe.trim());
        if (values.hoTen) fd.append("hoTen", values.hoTen.trim());
        fd.append(
          "image",
          shots[i].blob,
          shots[i].name || `${values.maYTe}-${i + 1}.jpg`,
        );
        const res = await http.postForm("/face/enroll", fd);
        if (res?.data?.ok) {
          success++;
          lastMessage = res.data.message || "";
        } else {
          message.warning(`Ảnh ${i + 1}: ${res?.data?.message || "thất bại"}`);
        }
      }
      if (success > 0) {
        message.success(
          `Đăng ký xong (${success}/${shots.length} ảnh) ${lastMessage}`,
        );
        form.resetFields();
        handleClearAll();
        loadPatients(kw, statusFilter);
      } else {
        message.error("Tất cả ảnh đều không đăng ký được");
      }
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || "Lỗi đăng ký");
    } finally {
      setSubmitting(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleRevoke = async (maYTe) => {
    try {
      const res = await http.post("/face/revoke", { maYTe });
      if (res?.data?.ok) {
        message.success(res.data.message);
        loadPatients(kw, statusFilter);
      } else {
        message.error(res?.data?.message || "Thu hồi thất bại");
      }
    } catch {
      message.error("Lỗi khi thu hồi");
    }
  };

  // Form xác nhận + cảnh báo trước khi thu hồi (sinh trắc, không hoàn tác).
  const confirmRevoke = (row) => {
    Modal.confirm({
      title: `Thu hồi khuôn mặt của ${row.hoTen || row.maYTe}?`,
      icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
      width: 460,
      content: (
        <div style={{ lineHeight: 1.6 }}>
          Mã y tế <b>{row.maYTe}</b> · {row.soAnh ?? row.activeImages ?? 0} ảnh
          đã đăng ký.
          <br />
          Thao tác này sẽ{" "}
          <b style={{ color: "#cf1322" }}>
            thu hồi toàn bộ dữ liệu khuôn mặt
          </b>{" "}
          của bệnh nhân và <b>KHÔNG thể hoàn tác</b>. Bệnh nhân sẽ phải đăng ký
          lại nếu muốn check-in bằng khuôn mặt.
        </div>
      ),
      okText: "Thu hồi",
      okButtonProps: { danger: true },
      cancelText: "Huỷ",
      onOk: () => handleRevoke(row.maYTe),
    });
  };

  // Auto-fill "Họ và tên" theo mã y tế (tên THẬT từ hồ sơ) + báo sớm nếu mã sai.
  const lookupName = async () => {
    const maYTe = (form.getFieldValue("maYTe") || "").trim();
    if (!maYTe) return;
    try {
      const res = await http.get("/emr/benh-nhan/by-ma-y-te", { maYTe });
      // Endpoint trả { benhNhan: {...}, bhyt: {...} } — tên ở benhNhan.TenBenhNhan.
      const bn = res?.data?.benhNhan || res?.data;
      const ten = bn?.TenBenhNhan || bn?.TENBENHNHAN;
      if (ten) {
        form.setFieldsValue({ hoTen: ten });
      } else {
        form.setFieldsValue({ hoTen: "" });
        message.warning(`Không tìm thấy bệnh nhân với mã ${maYTe}`);
      }
    } catch {
      /* im lặng — validate thật nằm ở backend lúc đăng ký */
    }
  };

  // Chọn 1 BN từ danh sách → điền sẵn mã + tên vào form để đăng ký.
  const pickPatient = (row) => {
    form.setFieldsValue({ maYTe: row.maYTe, hoTen: row.hoTen });
    message.success(
      `Đã chọn ${row.hoTen} (${row.maYTe}) — chụp/tải ảnh rồi bấm Đăng ký`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ─── UI ───────────────────────────────────────────────────────────────
  const columns = [
    { title: "Mã y tế", dataIndex: "maYTe", key: "maYTe", width: 110 },
    { title: "Họ tên", dataIndex: "hoTen", key: "hoTen" },
    {
      title: "Giới",
      dataIndex: "gioiTinh",
      key: "gioiTinh",
      width: 60,
      render: (v) => v || "—",
    },
    {
      title: "Năm sinh",
      dataIndex: "namSinh",
      key: "namSinh",
      width: 85,
      align: "center",
      render: (v) => v || "—",
    },
    {
      title: "Khuôn mặt",
      dataIndex: "soAnh",
      key: "soAnh",
      width: 100,
      align: "center",
      render: (n) =>
        n > 0 ? (
          <Tag color="green">{n} ảnh</Tag>
        ) : (
          <Tag color="orange">Chưa ĐK</Tag>
        ),
    },
    {
      title: "",
      key: "action",
      width: 170,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => pickPatient(row)}
          >
            {row.soAnh > 0 ? "Thêm ảnh" : "Đăng ký"}
          </Button>
          {row.soAnh > 0 && (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => confirmRevoke(row)}
            >
              Thu hồi
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const previewOverlay = (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {shots.length} / {TARGET_SHOTS}
    </div>
  );

  const tabItems = [
    {
      key: "upload",
      label: (
        <span>
          <UploadOutlined /> Tải ảnh lên
        </span>
      ),
      children: (
        <div>
          <Upload.Dragger
            multiple
            accept="image/*,.heic,.heif,.HEIC,.HEIF"
            beforeUpload={handleBeforeUpload}
            showUploadList={false}
            style={{ padding: 12 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: "#1677ff" }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 14 }}>
              Kéo thả ảnh vào đây hoặc bấm để chọn
            </p>
            <p
              className="ant-upload-hint"
              style={{ fontSize: 12, color: "#94a3b8" }}
            >
              Có thể chọn nhiều ảnh cùng lúc — khuyến nghị {TARGET_SHOTS} ảnh ở
              các góc khác nhau.
            </p>
          </Upload.Dragger>
        </div>
      ),
    },
    {
      key: "capture",
      label: (
        <span>
          <CameraOutlined /> Chụp camera
        </span>
      ),
      children: (
        <div>
          <Card
            size="small"
            style={{ borderRadius: 8 }}
            styles={{ body: { padding: 8 } }}
          >
            <FaceCameraPreview
              source={cam.source}
              setSource={cam.setSource}
              hikAvailable={cam.hikAvailable}
              videoRef={cam.videoRef}
              hikPreviewSrc={cam.hikPreviewSrc}
              overlay={previewOverlay}
            />
          </Card>

          {cam.error && (
            <div style={{ color: "#b91c1c", marginTop: 8 }}>{cam.error}</div>
          )}

          <Space wrap style={{ marginTop: 12 }}>
            {cam.source === "usb" &&
              (!webcamOn ? (
                <Button
                  icon={<PlayCircleOutlined />}
                  onClick={() => setWebcamOn(true)}
                >
                  Bật webcam
                </Button>
              ) : (
                <Button onClick={() => setWebcamOn(false)}>Tắt webcam</Button>
              ))}
            <Button
              type="primary"
              icon={<CameraOutlined />}
              disabled={!cam.ready || shots.length >= TARGET_SHOTS}
              onClick={handleCapture}
            >
              Chụp ảnh
            </Button>
          </Space>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<ScanOutlined />}
        title="Đăng ký khuôn mặt"
        subtitle="Đăng ký ảnh khuôn mặt bệnh nhân để nhận diện 1:N khi check-in tại Kiosk"
      />
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(420px, 1fr) 2fr",
        }}
      >
        <div>
          <div style={{ marginBottom: 12 }}>
            Trạng thái AI:{" "}
            {healthy === null ? (
              <Tag>đang kiểm tra</Tag>
            ) : healthy ? (
              <Tag color="green" icon={<CheckCircleFilled />}>
                Sẵn sàng
              </Tag>
            ) : (
              <Tag color="red">Không khả dụng</Tag>
            )}
          </div>

          <Form form={form} layout="vertical">
            <Form.Item
              name="maYTe"
              label="Mã y tế"
              rules={[{ required: true, message: "Vui lòng nhập mã y tế" }]}
            >
              <Input
                placeholder="VD: 210009394"
                onBlur={lookupName}
                onPressEnter={lookupName}
              />
            </Form.Item>
            <Form.Item
              name="hoTen"
              label="Họ và tên"
              tooltip="Tự điền theo mã y tế — không sửa tay để tránh sai danh tính"
            >
              <Input placeholder="Tự điền theo mã y tế" readOnly />
            </Form.Item>
          </Form>

          <Tabs
            activeKey={mode}
            onChange={setMode}
            items={tabItems}
            style={{ marginBottom: 12 }}
          />

          {/* Submit + clear */}
          <Space wrap>
            {shots.length > 0 && (
              <Button danger icon={<DeleteOutlined />} onClick={handleClearAll}>
                Xóa hết ({shots.length})
              </Button>
            )}
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              loading={submitting}
              disabled={shots.length === 0}
              onClick={handleSubmit}
            >
              Đăng ký ({shots.length} ảnh)
            </Button>
          </Space>

          {/* Progress bar */}
          {submitting && progress.total > 0 && (
            <Progress
              percent={Math.round((progress.current / progress.total) * 100)}
              status="active"
              format={() => `${progress.current}/${progress.total}`}
              style={{ marginTop: 12 }}
            />
          )}

          {/* Thumbnails */}
          {shots.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
                gap: 8,
                marginTop: 12,
              }}
            >
              {shots.map((s, idx) => (
                <div
                  key={s.url}
                  style={{
                    position: "relative",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "2px solid #e2e8f0",
                    aspectRatio: "1",
                  }}
                >
                  {/* Placeholder hiện khi trình duyệt không render được ảnh (vd HEIC) */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      background: "#f1f5f9",
                      color: "#64748b",
                      fontSize: 10,
                      padding: 4,
                      textAlign: "center",
                    }}
                  >
                    <FileImageOutlined style={{ fontSize: 22 }} />
                    <span
                      style={{
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.name}
                    </span>
                  </div>
                  <img
                    src={s.url}
                    alt={s.name || `Ảnh ${idx + 1}`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <Button
                    danger
                    size="small"
                    type="primary"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveShot(idx)}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      padding: "0 6px",
                      height: 22,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 4,
                      bottom: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 11,
                      maxWidth: "calc(100% - 8px)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.name}
                  >
                    {s.name && s.name.length > 12
                      ? `#${idx + 1}`
                      : s.name || `#${idx + 1}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, flex: "1 1 auto" }}>
              Danh sách bệnh nhân ({patients.length})
            </h2>
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "Chưa đăng ký", value: "unenrolled" },
                { label: "Đã đăng ký", value: "enrolled" },
                { label: "Tất cả", value: "all" },
              ]}
            />
          </div>
          <Input.Search
            placeholder="Tìm theo tên / mã y tế / CCCD / SĐT"
            allowClear
            onSearch={(v) => {
              setKw(v);
              loadPatients(v, statusFilter);
            }}
            style={{ marginBottom: 12 }}
          />
          <Table
            size="small"
            rowKey={(r) => r.maYTe}
            columns={columns}
            dataSource={patients}
            loading={loadingList}
            pagination={{ pageSize: 12 }}
          />
        </div>
      </div>
    </div>
  );
}
