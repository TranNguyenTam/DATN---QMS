import { CameraOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Radio } from "antd";

/**
 * Preview camera chung cho FaceCaptureModal + FaceEnrollment.
 * Hiển thị video <video> khi source="usb" hoặc <img> khi source="hikvision".
 * Có radio toggle khi cả 2 source khả dụng.
 *
 * Props từ useFaceCamera hook.
 */
export default function FaceCameraPreview({
  source,
  setSource,
  hikAvailable,
  videoRef,
  hikPreviewSrc,
  overlay = null, // ReactNode đè lên preview (vd badge "0/3")
  aspectRatio = "4 / 3",
}) {
  return (
    <div>
      {hikAvailable && (
        <Radio.Group
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{ marginBottom: 10 }}
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="hikvision">
            <VideoCameraOutlined /> Camera Hikvision
          </Radio.Button>
          <Radio.Button value="usb">
            <CameraOutlined /> Webcam USB
          </Radio.Button>
        </Radio.Group>
      )}

      <div
        style={{
          width: "100%",
          aspectRatio,
          background: "#0f172a",
          borderRadius: 8,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {source === "hikvision" ? (
          hikPreviewSrc ? (
            <img
              src={hikPreviewSrc}
              alt="Hikvision preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ color: "#94a3b8" }}>Đang kết nối Hikvision…</span>
          )
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
            }}
          />
        )}
        {overlay}
      </div>
    </div>
  );
}
