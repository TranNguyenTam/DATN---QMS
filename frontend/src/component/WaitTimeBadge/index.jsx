import { ClockCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import http from "../../util/httpClient";

/**
 * Hiển thị dự báo thời gian chờ.
 *
 * 2 mode:
 *   - mode="general" (mặc định): hiển thị "Chờ dự kiến: X phút" cho cả hàng đợi
 *     → GET /kiosk/wait-estimate?hangDoiId=&priorityWeight=
 *   - mode="personal": hiển thị "Đến giờ HH:mm, cách N BN" cho 1 STT cụ thể
 *     → GET /public/track?hangDoiId=&stt=  (endpoint public, KHÔNG cần JWT)
 *
 * Auto-refresh theo `pollMs` (mặc định 30s).
 */
const WaitTimeBadge = ({
  hangDoiId,
  stt = null,
  mode = "general",
  priorityWeight = 1,
  pollMs = 30000,
  variant = "default",
  label,
}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hangDoiId) return undefined;
    if (mode === "personal" && !stt) return undefined;
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res =
          mode === "personal"
            ? await http.get("/public/track", { hangDoiId, stt })
            : await http.get("/kiosk/wait-estimate", {
                hangDoiId,
                priorityWeight,
              });
        if (!cancelled) {
          setData(res?.data || null);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Không lấy được dự báo");
      }
    };

    fetchOnce();
    const timer = setInterval(fetchOnce, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hangDoiId, stt, mode, priorityWeight, pollMs]);

  if (!hangDoiId) return null;

  // Đồng bộ với palette Ant Design (blue-1..blue-6) thay cho Tailwind sky.
  const bg =
    variant === "tivi"
      ? "rgba(22, 119, 255, 0.18)"
      : variant === "kiosk"
      ? "#e6f4ff"
      : "#f0f5ff";
  const fg = "#003a8c"; // navy đậm — đọc rõ trên nền xanh nhạt (mọi variant)

  const wrapperStyle = {
    display: "inline-flex",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
    padding: variant === "tivi" ? "0.8vh 1.2vw" : "6px 12px",
    borderRadius: 10,
    background: bg,
    color: fg,
    fontWeight: 600,
    fontSize: variant === "tivi" ? "1.9vh" : 14,
    lineHeight: 1.25,
    flexWrap: "wrap",
    maxWidth: "100%",
  };

  if (mode === "personal") {
    const defaultLabel = label || "Đến lượt bạn lúc";
    const eta = data?.estimatedAt
      ? new Date(data.estimatedAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : null;
    return (
      <div style={wrapperStyle}>
        <ClockCircleOutlined style={{ marginRight: 2 }} />
        <span style={{ opacity: 0.8, fontWeight: 500 }}>{defaultLabel}:</span>
        {error ? (
          <span style={{ color: "#b91c1c" }}>--</span>
        ) : data ? (
          <>
            <span style={{ fontSize: variant === "tivi" ? 28 : 18 }}>
              {eta || "—"}
            </span>
            <span
              style={{
                marginLeft: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                opacity: 0.85,
                fontWeight: 500,
              }}
            >
              <TeamOutlined />
              cách {data.aheadCount ?? "—"} BN
            </span>
            {data.waitMinutes != null && (
              <span style={{ opacity: 0.7, fontWeight: 400 }}>
                (~{Math.round(data.waitMinutes)} phút)
              </span>
            )}
          </>
        ) : (
          <span style={{ opacity: 0.6 }}>…</span>
        )}
      </div>
    );
  }

  // mode === "general" (giữ tương thích cũ)
  const defaultLabel = label || "Chờ dự kiến";
  return (
    <div style={wrapperStyle}>
      <span style={{ opacity: 0.8, fontWeight: 500 }}>{defaultLabel}:</span>
      {error ? (
        <span style={{ color: "#b91c1c" }}>--</span>
      ) : data ? (
        <>
          <span
            style={{
              fontSize: variant === "tivi" ? "2.8vh" : 18,
              fontWeight: 800,
            }}
          >
            {data.predictedMinutes}
          </span>
          <span>phút</span>
          {data.range && (
            <span style={{ opacity: 0.7, fontWeight: 400 }}>({data.range})</span>
          )}
        </>
      ) : (
        <span style={{ opacity: 0.6 }}>…</span>
      )}
    </div>
  );
};

export default WaitTimeBadge;
