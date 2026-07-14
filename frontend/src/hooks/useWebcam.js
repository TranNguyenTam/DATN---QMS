import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook quản lý luồng webcam (getUserMedia) + chụp snapshot JPEG.
 *
 * `videoRef` là CALLBACK REF (không phải useRef): mỗi khi thẻ <video> mount lại —
 * ví dụ sau khi "Chụp lại" thẻ video bị gỡ rồi gắn lại — nó TỰ gắn lại stream đang
 * sống vào node mới → tránh màn hình đen. Cũng vá luôn race lúc mở modal (start()
 * lấy được stream trước khi <video> kịp mount).
 *
 * Trả về:
 *   - videoRef: gán vào <video ref={videoRef}>
 *   - ready / error
 *   - start(): mở camera (tái dùng stream còn sống, không xin quyền lại)
 *   - stop():  giải phóng camera
 *   - capture(): Promise<Blob> JPEG từ frame hiện tại
 */
export default function useWebcam({ width = 640, height = 480 } = {}) {
  const videoNodeRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // Callback ref: gắn stream vào <video> NGAY khi node xuất hiện (mount/remount).
  const videoRef = useCallback((node) => {
    videoNodeRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      // Tái dùng stream còn sống (tránh xin quyền lại + giảm nhấp nháy).
      let stream = streamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width, height, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
      }
      if (videoNodeRef.current) {
        videoNodeRef.current.srcObject = stream;
        await videoNodeRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (e) {
      setError(e?.message || "Không truy cập được webcam");
      setReady(false);
    }
  }, [width, height]);

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoNodeRef.current) {
      videoNodeRef.current.srcObject = null;
    }
    setReady(false);
  }, []);

  const capture = useCallback(async () => {
    const video = videoNodeRef.current;
    if (!video || !video.videoWidth) {
      throw new Error("Webcam chưa sẵn sàng");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Không encode được JPEG"))),
        "image/jpeg",
        0.92,
      ),
    );
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, ready, error, start, stop, capture };
}
