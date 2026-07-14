import { useCallback, useEffect, useRef, useState } from "react";
import http from "../util/httpClient";
import useWebcam from "./useWebcam";

/**
 * Hook quản lý camera cho cả 2 module Face (Enrollment + CheckIn Kiosk).
 *
 * 2 nguồn:
 *   - "hikvision": IP camera Hikvision qua RTSP, preview qua polling
 *     `/face/camera/snapshot` (BE đã pre-encode JPEG cache).
 *   - "usb": webcam laptop/USB qua navigator.mediaDevices.
 *
 * Khi `enabled = true`:
 *   1. Gọi /face/camera/status để check Hikvision sẵn sàng không.
 *   2. Nếu có → mặc định source="hikvision", FE poll snapshot ~8fps.
 *   3. Nếu không → fallback source="usb", bật webcam.
 *   4. Người dùng switch tay được qua setSource().
 *
 * Trả về:
 *   - videoRef: gán vào <video> khi source="usb"
 *   - hikPreviewSrc: blob URL gán vào <img> khi source="hikvision"
 *   - capture(): Promise<Blob> — chụp 1 ảnh JPEG từ nguồn hiện tại
 *   - source, setSource, hikAvailable, ready, error
 */
export default function useFaceCamera({ enabled = true, pollMs = 120 } = {}) {
  const { videoRef, ready: webcamReady, error: webcamError, start, stop, capture: webcamCapture } = useWebcam();

  const [source, setSource] = useState("usb");
  const [hikAvailable, setHikAvailable] = useState(false);
  const [hikPreviewSrc, setHikPreviewSrc] = useState(null);
  const [hikError, setHikError] = useState(null);
  const apiBaseRef = useRef(null);

  if (!apiBaseRef.current) {
    apiBaseRef.current =
      import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`;
  }
  const snapshotUrl = `${apiBaseRef.current}/face/camera/snapshot`;

  // 1) Detect Hikvision khi enabled.
  useEffect(() => {
    if (!enabled) {
      setHikAvailable(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await http.get("/face/camera/status");
        const data = res?.data;
        if (cancelled) return;
        if (data?.hikAvailable) {
          setHikAvailable(true);
          setSource("hikvision");
        } else {
          setHikAvailable(false);
          setSource("usb");
        }
      } catch {
        if (!cancelled) {
          setHikAvailable(false);
          setSource("usb");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // 2) Start/stop webcam theo source.
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    if (source === "usb") {
      start();
    } else {
      stop();
    }
    return () => {
      if (!enabled) stop();
    };
  }, [enabled, source, start, stop]);

  // 3) Poll snapshot Hikvision → blob URL preview.
  useEffect(() => {
    if (!enabled || source !== "hikvision") {
      setHikPreviewSrc(null);
      return undefined;
    }
    let stopped = false;
    let lastUrl = null;
    let inflight = false;

    const tick = async () => {
      if (stopped) return;
      if (inflight) {
        setTimeout(tick, pollMs);
        return;
      }
      inflight = true;
      try {
        const resp = await fetch(`${snapshotUrl}?t=${Date.now()}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        if (!resp.ok) throw new Error(`Hikvision ${resp.status}`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = url;
        if (!stopped) {
          setHikPreviewSrc(url);
          setHikError(null);
        }
      } catch (e) {
        if (!stopped) setHikError(e?.message || "Lỗi snapshot Hikvision");
      } finally {
        inflight = false;
      }
      if (!stopped) setTimeout(tick, pollMs);
    };
    tick();

    return () => {
      stopped = true;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    };
  }, [enabled, source, snapshotUrl, pollMs]);

  // 4) Capture universal — trả Blob JPEG bất kể nguồn nào.
  const capture = useCallback(async () => {
    if (source === "hikvision") {
      const resp = await fetch(`${snapshotUrl}?t=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (!resp.ok) throw new Error(`Hikvision ${resp.status}`);
      return await resp.blob();
    }
    return await webcamCapture();
  }, [source, snapshotUrl, webcamCapture]);

  const ready = source === "hikvision" ? !!hikPreviewSrc : webcamReady;
  const error = source === "hikvision" ? hikError : webcamError;

  return {
    // states
    source,
    setSource,
    hikAvailable,
    ready,
    error,
    // USB-specific
    videoRef,
    startWebcam: start,
    stopWebcam: stop,
    // Hikvision-specific
    hikPreviewSrc,
    // universal
    capture,
  };
}
