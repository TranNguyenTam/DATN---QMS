import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTS_NEED_VOICE } from "../../const/const";
import { useSocket } from "../../hooks/useSocket";
import { postVoice } from "../../util/amthanhApi";
import http from "../../util/httpClient";

function Loa() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Đang khởi tạo...");

  // Hàng đợi phát âm thanh
  const queueRef = useRef([]);
  const isSpeakingRef = useRef(false);

  // ========== 1. Khởi tạo: lấy thông tin user ==========
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const infoRes = await http.get("/user/info");
        console.log("[Loa] User info:", infoRes);
        if (infoRes?.data) setInfo(infoRes.data);
        setStatus("Sẵn sàng phát âm thanh");
      } catch (err) {
        console.error("[Loa] Lỗi khởi tạo:", err);
        setStatus("Lỗi khởi tạo");
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // ========== 2. Phát audio từ ArrayBuffer ==========
  const playAudioBuffer = useCallback((arrayBuffer) => {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };

        audio.play().catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }, []);

  // ========== 3. Xử lý hàng đợi TTS ==========
  const processQueue = useCallback(async () => {
    if (isSpeakingRef.current) return;
    const nextText = queueRef.current.shift();
    if (!nextText) return;

    isSpeakingRef.current = true;
    setStatus(`Đang phát: ${nextText}`);
    try {
      console.info("[Loa][TTS] Đang xử lý:", nextText);
      const audioData = await postVoice(nextText);
      if (audioData) {
        console.info("[Loa][TTS] Phát audio, bytes:", audioData.byteLength);
        await playAudioBuffer(audioData);
      } else {
        console.error("[Loa][TTS] Không tạo được âm thanh");
      }
    } catch (error) {
      console.error("[Loa][TTS] Lỗi phát âm thanh:", error);
    } finally {
      isSpeakingRef.current = false;
      setStatus(
        queueRef.current.length > 0
          ? `Còn ${queueRef.current.length} trong hàng đợi...`
          : "Sẵn sàng phát âm thanh"
      );
      processQueue(); // xử lý tiếp nếu còn trong hàng đợi
    }
  }, [playAudioBuffer]);

  const announce = useCallback(
    (text) => {
      if (!text) return;
      queueRef.current.push(text);
      console.info("[Loa] Enqueue:", text, "queueSize:", queueRef.current.length);
      processQueue();
    },
    [processQueue]
  );

  const fetchDangGoiByPhongBan = useCallback(async (phongBanId) => {
    const endpoints = [
      "/kham-benh/dang-goi",
      "/cls/dang-goi",
      "/vien-phi/dang-goi",
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await http.get(endpoint, { phongBanId });
        const bn = res?.data?.[0];
        if (bn) return bn;
      } catch (err) {
        console.warn("[Loa] Lỗi lấy dang-goi", { endpoint, phongBanId, err });
      }
    }

    return null;
  }, []);

  // ========== 4. Nhận sự kiện gọi bệnh từ socket ==========
  const handleSocketMessage = useCallback(
    async (data) => {
      console.log("[Loa] Socket message:", data);

      // Chỉ xử lý sự kiện GOI_BN và GOI_LAI
      if (!EVENTS_NEED_VOICE.has(data?.event)) return;
      if (!data?.phongBanId) return;

      try {
        // Thử nhiều module để tương thích mọi luồng gọi bệnh.
        const bn = await fetchDangGoiByPhongBan(data.phongBanId);
        if (!bn) {
          console.warn("[Loa] Không tìm thấy bệnh nhân đang gọi");
          return;
        }

        const stt = bn.SoThuTuDayDu || bn.STT;
        const ten = bn.TenBenhNhan;
        const phong = bn.TenPhongBanDayDu || "phong kham";
        const text = `Mời bệnh nhân số ${stt}, ${ten}, vào ${phong}.`;

        console.info("[Loa] Gọi TTS:", text);
        announce(text);
      } catch (err) {
        console.error("[Loa] Lỗi lấy thông tin bệnh nhân:", err);
      }
    },
    [announce, fetchDangGoiByPhongBan]
  );

  // ========== 5. Socket: subscribe topic chung ==========
  const { isConnected, sendMessage, subscribe, unsubscribe } = useSocket();

  // Register device (giữ logic cũ)
  useEffect(() => {
    if (
      !isConnected ||
      !info ||
      info.Devices?.TenAmThanh !== info.Devices?.UserCode
    )
      return;
    sendMessage("/app/device/register", {
      deviceName: info?.Devices.TenAmThanh,
      deviceType: "SPEAKER",
    });
  }, [isConnected, sendMessage, info]);

  // Subscribe topic chung /topic/messages để nhận sự kiện gọi bệnh
  useEffect(() => {
    if (!isConnected || !info) return;

    const __sub = subscribe("/topic/messages", handleSocketMessage);
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, info, handleSocketMessage]);

  // ========== 6. Giao diện ==========
  if (loading) return <></>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        color: "#fff",
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "40px 60px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔊</div>
        <h1 style={{ fontSize: 28, marginBottom: 8, fontWeight: 600 }}>
          Hệ thống Loa QMS
        </h1>
        <p style={{ fontSize: 16, opacity: 0.7, marginBottom: 20 }}>
          {info?.Devices?.TenAmThanh || "Loa chưa đặt tên"}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isConnected ? "#4ade80" : "#f87171",
              display: "inline-block",
              animation: isConnected ? "pulse 2s infinite" : "none",
            }}
          />
          <span style={{ fontSize: 14, opacity: 0.8 }}>
            {isConnected ? "Đã kết nối WebSocket" : "Mất kết nối"}
          </span>
        </div>

        <p
          style={{
            fontSize: 14,
            opacity: 0.6,
            fontStyle: "italic",
          }}
        >
          {status}
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default Loa;
