import { CameraOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Button, Modal, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import useFaceCamera from "../../hooks/useFaceCamera";
import http from "../../util/httpClient";
import FaceCameraPreview from "../FaceCameraPreview";

/**
 * Modal chụp khuôn mặt + gọi /kiosk/face-checkin (multipart).
 * Tự detect Hikvision; nếu không có thì fallback webcam USB.
 */
export default function FaceCaptureModal({
  open,
  onClose,
  onSuccess,
  hangDoiId,
  uuTien = 0,
  loaiUuTien = null,
  priorityWeight = 1,
  manualPatientCode = null,
  dichVuId = null,
}) {
  const cam = useFaceCamera({ enabled: open });
  const [snapshot, setSnapshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!open) {
      if (snapshot?.url) URL.revokeObjectURL(snapshot.url);
      setSnapshot(null);
      setMsg(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShot = useCallback(async () => {
    try {
      const blob = await cam.capture();
      if (snapshot?.url) URL.revokeObjectURL(snapshot.url);
      setSnapshot({ blob, url: URL.createObjectURL(blob) });
      setMsg(null);
    } catch (e) {
      setMsg(e?.message || "Chụp thất bại");
    }
  }, [cam, snapshot]);

  const handleRetake = () => {
    if (snapshot?.url) URL.revokeObjectURL(snapshot.url);
    setSnapshot(null);
  };

  const handleSubmit = async () => {
    if (!snapshot?.blob) {
      setMsg("Vui lòng chụp ảnh trước");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("hangDoiId", String(hangDoiId));
      fd.append("uuTien", String(uuTien));
      if (loaiUuTien) fd.append("loaiUuTien", loaiUuTien);
      fd.append("priorityWeight", String(priorityWeight));
      if (manualPatientCode) fd.append("manualPatientCode", manualPatientCode);
      if (dichVuId) fd.append("dichVuId", String(dichVuId));
      fd.append("image", snapshot.blob, "kiosk-frame.jpg");

      const res = await http.postForm("/kiosk/face-checkin", fd);
      const data = res?.data;
      if (data?.success) {
        onSuccess?.({ ...data, captureSource: cam.source });
        onClose?.();
      } else {
        setMsg(data?.message || "Nhận diện thất bại");
      }
    } catch (e) {
      setMsg(e?.message || "Lỗi kết nối");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          Check-in bằng khuôn mặt{" "}
          {cam.source === "hikvision" ? (
            <Tag color="blue" icon={<VideoCameraOutlined />}>
              Camera Hikvision
            </Tag>
          ) : (
            <Tag color="default" icon={<CameraOutlined />}>
              Webcam USB
            </Tag>
          )}
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={580}
      destroyOnClose
    >
      {snapshot ? (
        <div
          style={{
            width: "100%",
            aspectRatio: "4 / 3",
            background: "#111",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <img
            src={snapshot.url}
            alt="snapshot"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      ) : (
        <FaceCameraPreview
          source={cam.source}
          setSource={cam.setSource}
          hikAvailable={cam.hikAvailable}
          videoRef={cam.videoRef}
          hikPreviewSrc={cam.hikPreviewSrc}
        />
      )}

      {(cam.error || msg) && (
        <div style={{ color: "#b91c1c", marginTop: 8 }}>{cam.error || msg}</div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          justifyContent: "flex-end",
        }}
      >
        {!snapshot && (
          <Button type="primary" disabled={!cam.ready} onClick={handleShot}>
            Chụp
          </Button>
        )}
        {snapshot && (
          <>
            <Button onClick={handleRetake}>Chụp lại</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              Xác nhận check-in
            </Button>
          </>
        )}
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Modal>
  );
}
