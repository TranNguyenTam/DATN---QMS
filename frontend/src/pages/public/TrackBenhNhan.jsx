import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  FontSizeOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Statistic, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import http from "../../util/httpClient";

const { Text } = Typography;
const TRACK_KEY = "qms_track_target";
const ONBOARD_KEY = "qms_track_onboarded";

// Các bước trong hành trình khám (map theo HangDoi_Id).
const JOURNEY = [
  { key: "tn", label: "Tiếp nhận", icon: "📝", ids: [1] },
  { key: "kb", label: "Khám", icon: "🩺", ids: [3] },
  { key: "cls", label: "Xét nghiệm / CĐHA", icon: "🔬", ids: [6, 7, 8, 10] },
  { key: "vp", label: "Viện phí", icon: "💳", ids: [4] },
  { key: "nt", label: "Nhà thuốc", icon: "💊", ids: [5] },
];
const stepIndexOf = (hangDoiId) =>
  JOURNEY.findIndex((s) => s.ids.includes(Number(hangDoiId)));

// Nội dung hướng dẫn 4 bước.
const ONBOARD = [
  { icon: "🎫", title: "Đây là số của bạn", body: "Số thứ tự hiển thị lớn ở đầu trang. Bạn không phải đứng xếp hàng chờ." },
  { icon: "👥", title: "Xem còn bao nhiêu người", body: "Trang cho biết số người trước bạn và thời gian dự kiến đến lượt." },
  { icon: "🔔", title: "Bật nhắc nhở", body: "Bấm nút \"Bật nhắc nhở\" để được báo (chuông/thông báo) khi sắp tới lượt." },
  { icon: "🪑", title: "Cứ thoải mái chờ", body: "Khi sắp/đến lượt hãy quay lại quầy. Loa và màn hình tại sảnh cũng sẽ gọi số của bạn." },
];

// VAPID public key (base64url) → Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function TrackBenhNhan() {
  const params = useParams();
  const [search] = useSearchParams();

  const target = useMemo(() => {
    const b = Number(params.bn || search.get("bn") || 0);
    const i = Number(params.id || search.get("id") || 0);
    const h = Number(params.hangDoiId || search.get("hangDoiId") || 0);
    const s = Number(params.stt || search.get("stt") || 0);
    if (b > 0 || i > 0 || (h > 0 && s > 0))
      return { bn: b, id: i, hangDoiId: h, stt: s, fromUrl: true };
    try {
      const saved = JSON.parse(localStorage.getItem(TRACK_KEY) || "null");
      if (saved)
        return { bn: saved.bn || 0, id: saved.id || 0, hangDoiId: saved.hangDoiId || 0, stt: saved.stt || 0, fromUrl: false };
    } catch {
      /* bỏ qua */
    }
    return { bn: 0, id: 0, hangDoiId: 0, stt: 0, fromUrl: false };
  }, [params, search]);
  const { bn, id, hangDoiId, stt } = target;
  const hasTarget = bn > 0 || id > 0 || (hangDoiId > 0 && stt > 0);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [remindOn, setRemindOn] = useState(false);
  const [osNotif, setOsNotif] = useState(false);
  const [bigText, setBigText] = useState(false);
  const [guideStep, setGuideStep] = useState(-1); // -1 = ẩn
  const prevAhead = useRef(null);
  const audioCtxRef = useRef(null);
  const [installEvt, setInstallEvt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  const fs = (px) => (bigText ? Math.round(px * 1.28) : px);
  const isStandalone =
    (typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)")?.matches) ||
    window.navigator?.standalone === true;

  // Lưu mục tiêu để mở lại đúng số.
  useEffect(() => {
    if (target.fromUrl) {
      try {
        localStorage.setItem(TRACK_KEY, JSON.stringify({ bn, id, hangDoiId, stt }));
      } catch {
        /* bỏ qua */
      }
    }
  }, [target, bn, id, hangDoiId, stt]);

  // Manifest PWA động (start_url = URL hiện tại) cho iOS Add-to-Home-Screen.
  useEffect(() => {
    if (!hasTarget || !target.fromUrl) return undefined;
    const qs = bn > 0 ? `bn=${bn}` : id > 0 ? `id=${id}` : `hangDoiId=${hangDoiId}&stt=${stt}`;
    const href = `/api/v1/public/track-manifest?${qs}`;
    let link = document.querySelector('link[rel="manifest"]');
    const prev = link ? link.getAttribute("href") : null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.setAttribute("href", href);
    return () => {
      if (prev != null) link.setAttribute("href", prev);
    };
  }, [hasTarget, target.fromUrl, bn, id, hangDoiId, stt]);

  // Hiện hướng dẫn lần đầu.
  useEffect(() => {
    if (!hasTarget) return;
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setGuideStep(0);
    } catch {
      /* bỏ qua */
    }
  }, [hasTarget]);

  // Bắt sự kiện cài app (Android/Chrome) để nút "Cài app" gọi prompt gốc.
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const fetchData = useCallback(async () => {
    if (!hasTarget) return;
    setLoading(true);
    try {
      const query = bn > 0 ? { bn } : id > 0 ? { id } : { hangDoiId, stt };
      const res = await http.get("/public/track", query);
      setData(res?.data || null);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e?.message || "Không lấy được thông tin");
    } finally {
      setLoading(false);
    }
  }, [bn, id, hangDoiId, stt, hasTarget]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 15000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const beep = () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.6);
    } catch {
      /* bỏ qua */
    }
  };

  const subscribePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await http.get("/public/push/vapid-public-key");
      const key = res?.data?.publicKey;
      if (!key) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await http.post("/public/push/subscribe", { subscription: sub.toJSON(), id: bn > 0 ? 0 : id, bn });
  };

  const enableReminder = async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtxRef.current = audioCtxRef.current || new Ctx();
        await audioCtxRef.current.resume();
      }
    } catch {
      /* bỏ qua */
    }
    let granted = false;
    if ("Notification" in window) {
      try {
        granted = (await Notification.requestPermission()) === "granted";
      } catch {
        /* bỏ qua */
      }
    }
    setOsNotif(granted);
    let pushed = false;
    if (granted) {
      try {
        await subscribePush();
        pushed = true;
      } catch {
        /* bỏ qua */
      }
    }
    setRemindOn(true);
    beep();
    message.success(
      pushed
        ? "Đã bật nhắc nhở + thông báo (kể cả khi thoát app)."
        : granted
          ? "Đã bật nhắc nhở (âm thanh + thông báo khi đang mở)."
          : "Đã bật nhắc nhở bằng âm thanh.",
    );
  };

  // Đọc to trạng thái bằng giọng nói (Web Speech API, dùng giọng tiếng Việt nếu có).
  const readAloud = () => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) {
        message.info("Thiết bị không hỗ trợ đọc to.");
        return;
      }
      synth.cancel();
      const parts = [];
      if (displayStt != null) parts.push(`Số thứ tự của bạn là ${displayStt}.`);
      if (data?.hangDoiName) parts.push(`Tại ${data.hangDoiName}.`);
      if (ahead != null)
        parts.push(ahead <= 0 ? "Sắp đến lượt của bạn." : `Còn ${ahead} người trước bạn.`);
      if (data?.waitMinutes != null) parts.push(`Dự kiến khoảng ${Math.round(data.waitMinutes)} phút.`);
      const u = new SpeechSynthesisUtterance(parts.join(" "));
      u.lang = "vi-VN";
      u.rate = 0.95;
      synth.speak(u);
    } catch {
      message.info("Không đọc được.");
    }
  };

  const closeGuide = () => {
    setGuideStep(-1);
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* bỏ qua */
    }
  };

  const doInstall = async () => {
    if (installEvt) {
      installEvt.prompt();
      try {
        await installEvt.userChoice;
      } catch {
        /* bỏ qua */
      }
      setInstallEvt(null);
    } else {
      setShowInstall(true); // iOS / không có prompt → hiện hướng dẫn thủ công
    }
  };

  useEffect(() => {
    const ahead = data?.aheadCount;
    if (ahead == null) return;
    const prev = prevAhead.current;
    const justBecameNear = (prev == null || prev > 1) && ahead <= 1;
    if (ahead <= 1 && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (remindOn && justBecameNear) {
      beep();
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(ahead === 0 ? "Đến lượt bạn!" : "Sắp đến lượt bạn!", {
          body:
            ahead === 0
              ? "Vui lòng quay lại quầy ngay."
              : `Còn ${ahead} người trước bạn. Vui lòng quay lại quầy.`,
        });
      }
    }
    prevAhead.current = ahead;
  }, [data?.aheadCount, remindOn]);

  const ahead = data?.aheadCount;
  const isNear = ahead != null && ahead <= 1;
  const isVeryNear = ahead === 0;
  const rawStt = data?.stt ?? (stt || null);
  // Hiển thị ĐÚNG số như kiosk/loa = SoThuTuDayDu (vd "1001"); fallback STT thô.
  const displayStt = data?.soThuTuDayDu || (rawStt != null ? String(rawStt).padStart(3, "0") : null);
  const journeyDone = bn > 0 && data != null && !data.hangDoiName;
  const curStep = stepIndexOf(data?.hangDoiId);

  const eta = data?.estimatedAt
    ? new Date(data.estimatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;

  // ─── Hướng dẫn 4 bước (overlay) ───
  const guideOverlay = guideStep >= 0 && (
    <div style={overlayStyle} onClick={closeGuide}>
      <div style={guideCardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 72 }}>{ONBOARD[guideStep].icon}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0b3b8c", margin: "10px 0 6px" }}>
          {ONBOARD[guideStep].title}
        </div>
        <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.6, minHeight: 72 }}>
          {ONBOARD[guideStep].body}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, margin: "16px 0" }}>
          {ONBOARD.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === guideStep ? 22 : 8,
                height: 8,
                borderRadius: 4,
                background: i === guideStep ? "#1677ff" : "#cbd5e1",
                transition: "all .2s",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button block onClick={closeGuide}>
            Bỏ qua
          </Button>
          {guideStep < ONBOARD.length - 1 ? (
            <Button block type="primary" onClick={() => setGuideStep((s) => s + 1)}>
              Tiếp
            </Button>
          ) : (
            <Button block type="primary" onClick={closeGuide}>
              Bắt đầu
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const installOverlay = showInstall && (
    <div style={overlayStyle} onClick={() => setShowInstall(false)}>
      <div style={guideCardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 56 }}>📲</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0b3b8c", margin: "10px 0 12px" }}>
          Cài ứng dụng vào màn hình chính
        </div>
        <div style={{ textAlign: "left", fontSize: 14, color: "#334155", lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: "#0b3b8c", marginBottom: 2 }}>🍎 iPhone (Safari)</div>
          <div>1️⃣ Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên ↑) ở thanh dưới.</div>
          <div>2️⃣ Chọn <b>"Thêm vào Màn hình chính"</b> → <b>"Thêm"</b>.</div>
          <div style={{ fontWeight: 700, color: "#0b3b8c", margin: "12px 0 2px" }}>🤖 Android (Chrome)</div>
          <div>1️⃣ Bấm menu <b>⋮</b> (góc trên phải).</div>
          <div>2️⃣ Chọn <b>"Thêm vào Màn hình chính"</b> / <b>"Cài đặt ứng dụng"</b>.</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", textAlign: "left" }}>
          Mở app từ icon để nhận thông báo khi sắp tới lượt (kể cả khi thoát app).
        </div>
        <Button block type="primary" style={{ marginTop: 16 }} onClick={() => setShowInstall(false)}>
          Đã hiểu
        </Button>
      </div>
    </div>
  );

  if (!hasTarget) {
    return (
      <div style={pageStyle}>
        {guideOverlay}
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 48 }}>
          <div style={{ fontSize: 56 }}>📷</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", margin: "12px 0 6px" }}>
            Theo dõi số thứ tự
          </div>
          <Text type="secondary">
            Vui lòng quét mã QR trên phiếu/màn hình Kiosk để xem số thứ tự của bạn.
          </Text>
        </div>
      </div>
    );
  }

  if (journeyDone) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 60 }}>
          <CheckCircleOutlined style={{ fontSize: 72, color: "#52c41a" }} />
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", margin: "12px 0 6px" }}>
            Đã hoàn tất
          </div>
          <Text type="secondary">Bạn đã hoàn tất các bước khám hôm nay. Cảm ơn bạn!</Text>
          <div style={{ marginTop: 20 }}>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchData}>
              Làm mới
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {guideOverlay}
      {installOverlay}
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Thanh công cụ: hướng dẫn / chữ to / đọc to */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
          {!isStandalone && (
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={doInstall}
              style={{ background: "#1677ff", borderColor: "#1677ff", color: "#fff", fontWeight: 600 }}
            >
              Cài app
            </Button>
          )}
          <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setGuideStep(0)}>
            Hướng dẫn
          </Button>
          <Button
            size="small"
            type={bigText ? "primary" : "default"}
            icon={<FontSizeOutlined />}
            onClick={() => setBigText((v) => !v)}
          >
            Chữ to
          </Button>
          <Button size="small" icon={<SoundOutlined />} onClick={readAloud}>
            Đọc to
          </Button>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #1677ff 0%, #4096ff 50%, #69b1ff 100%)",
            borderRadius: 16,
            padding: 24,
            color: "#fff",
            textAlign: "center",
            marginBottom: 12,
            boxShadow: "0 10px 30px rgba(22, 119, 255, 0.3)",
          }}
        >
          <div style={{ fontSize: fs(14), opacity: 0.9, letterSpacing: 2 }}>SỐ THỨ TỰ CỦA BẠN</div>
          <div style={{ fontSize: fs(84), fontWeight: 900, lineHeight: 1, margin: "6px 0" }}>
            {displayStt ?? "—"}
          </div>
          {data?.tenBenhNhan && <div style={{ fontSize: fs(18), fontWeight: 600 }}>{data.tenBenhNhan}</div>}
          <div style={{ fontSize: fs(12), opacity: 0.85, marginTop: 8 }}>
            <EnvironmentOutlined /> {data?.hangDoiName || "—"}
            {data?.phongBanName ? ` · ${data.phongBanName}` : ""}
          </div>
        </div>

        {/* Thanh tiến trình hành trình */}
        <Card style={{ borderRadius: 12, marginBottom: 12 }} styles={{ body: { padding: "14px 10px" } }}>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {JOURNEY.map((s, i) => {
              const done = curStep >= 0 && i < curStep;
              const active = i === curStep;
              return (
                <div
                  key={s.key}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    opacity: curStep < 0 ? 0.5 : active || done ? 1 : 0.4,
                    position: "relative",
                  }}
                >
                  {i < JOURNEY.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: fs(13),
                        left: "60%",
                        right: "-40%",
                        height: 2,
                        background: done ? "#52c41a" : "#e2e8f0",
                      }}
                    />
                  )}
                  <div style={{ fontSize: fs(active ? 24 : 19), lineHeight: 1, position: "relative" }}>
                    {done ? "✅" : s.icon}
                  </div>
                  <div
                    style={{
                      fontSize: fs(10),
                      marginTop: 4,
                      fontWeight: active ? 700 : 500,
                      color: active ? "#1677ff" : done ? "#52c41a" : "#94a3b8",
                      lineHeight: 1.2,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {isVeryNear ? (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="ĐẾN LƯỢT BẠN!" description="Vui lòng quay lại quầy ngay." />
        ) : isNear ? (
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Sắp đến lượt bạn" description="Vui lòng quay lại quầy trong vòng vài phút." />
        ) : null}

        <Card style={{ borderRadius: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Statistic
              title="Đang gọi"
              value={data?.currentSoThuTuDayDu || (data?.currentSTT != null ? String(data.currentSTT).padStart(3, "0") : "—")}
              groupSeparator=""
              valueStyle={{ color: "#1677ff", fontSize: fs(28) }}
              style={{ flex: 1 }}
            />
            <Statistic
              title="Trước bạn"
              value={ahead ?? "—"}
              groupSeparator=""
              prefix={<TeamOutlined />}
              valueStyle={{ color: isNear ? "#fa8c16" : "#003a8c", fontSize: fs(28) }}
              suffix="BN"
              style={{ flex: 1 }}
            />
          </div>

          <div style={{ padding: 14, background: isNear ? "#fff7e6" : "#e6f4ff", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: fs(12), color: "#64748b", marginBottom: 4 }}>
              <ClockCircleOutlined /> Dự kiến đến lượt
            </div>
            <div style={{ fontSize: fs(32), fontWeight: 700, color: isNear ? "#fa8c16" : "#003a8c", lineHeight: 1.1 }}>
              {eta || "Đang tính…"}
            </div>
            {data?.waitMinutes != null && (
              <Tag color={isNear ? "orange" : "blue"} style={{ marginTop: 6, fontSize: fs(13) }}>
                Còn ~{Math.round(data.waitMinutes)} phút
              </Tag>
            )}
          </div>

          <Button
            block
            type={remindOn ? "default" : "primary"}
            icon={<BellOutlined />}
            onClick={enableReminder}
            disabled={remindOn}
            style={{ marginTop: 12, height: fs(40) }}
          >
            {remindOn ? "Đã bật nhắc nhở khi sắp tới lượt" : "Bật nhắc nhở khi sắp tới lượt"}
          </Button>
          {remindOn && !osNotif && (
            <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 6 }}>
              Sẽ kêu chuông + hiển thị khi sắp tới lượt. (iPhone: "Thêm vào màn hình chính" để nhận thông báo đẩy.)
            </div>
          )}
        </Card>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {lastUpdated ? `Cập nhật lúc ${lastUpdated.toLocaleTimeString("vi-VN")}` : "Đang tải…"}
          </Text>
          <Button size="small" icon={<ReloadOutlined spin={loading} />} onClick={fetchData} loading={loading}>
            Làm mới
          </Button>
        </div>

        {error && <Alert type="error" showIcon style={{ marginTop: 12 }} message={error} />}

        <div style={{ textAlign: "center", marginTop: 24, opacity: 0.6 }}>
          <Text style={{ fontSize: 11 }}>Bệnh viện Y học cổ truyền Đà Nẵng</Text>
        </div>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f0f5ff 0%, #ffffff 100%)",
  padding: "20px 16px",
  fontFamily: "Inter, sans-serif",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 1000,
};

const guideCardStyle = {
  background: "#fff",
  borderRadius: 18,
  padding: "28px 22px",
  maxWidth: 360,
  width: "100%",
  textAlign: "center",
  boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
};
