import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EVENTS_NEED_REFRESH,
  MODULE_PHONG_BAN,
  PHONG_BAN_HANG_DOI,
} from "../../../const/const";
import TiviFooter from "../../../component/TiviFooter";
import WaitTimeBadge from "../../../component/WaitTimeBadge";
import { useSocket } from "../../../hooks/useSocket";
import http from "../../../util/httpClient";

/**
 * 1 ô phòng CĐHA: số đang gọi + tên BN + chờ dự kiến (dự báo RIÊNG theo hàng đợi của phòng).
 */
function RoomCell({ room, hangDoiId, tick }) {
  const [cur, setCur] = useState(null);

  const fetchCur = useCallback(async () => {
    if (!room?.FieldCode || !hangDoiId) return;
    try {
      const res = await http.get("/cls/dang-goi", {
        phongBanId: room.FieldCode,
        hangDoiId,
      });
      setCur(res?.data?.[0] || null);
    } catch {
      /* bỏ qua lỗi 1 ô, không làm sập cả màn */
    }
  }, [room, hangDoiId]);

  useEffect(() => {
    fetchCur();
  }, [fetchCur, tick]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        boxShadow: "var(--shadow-1)",
        padding: "3.5vh 1vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        height: "100%",
      }}
    >
      {/* Tên phòng (đỉnh) */}
      <div
        style={{
          fontSize: "2.4vh",
          fontWeight: 800,
          color: "var(--color-secondary)",
          textTransform: "uppercase",
          textAlign: "center",
          letterSpacing: "0.03em",
        }}
      >
        {room.FieldName}
      </div>

      {/* Số đang gọi (giữa, chiếm phần lớn) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: "15vh",
            fontWeight: 900,
            color: "var(--color-accent-orange)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {cur?.STT || "---"}
        </div>
      </div>

      {/* Tên BN + dự báo (đáy — căn thẳng giữa các thẻ) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.2vh",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: "2.1vh",
            fontWeight: 700,
            color: "var(--color-primary)",
            textTransform: "uppercase",
            textAlign: "center",
            minHeight: "5vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {cur?.TENBENHNHAN || "—"}
        </div>
        <WaitTimeBadge hangDoiId={Number(hangDoiId)} variant="tivi" />
      </div>
    </div>
  );
}

/**
 * Tivi CĐHA TỔNG HỢP — 1 màn hiển thị CẢ các phòng CĐHA cùng lúc, mỗi phòng có
 * số đang gọi + thời gian chờ dự kiến RIÊNG (dự báo theo từng HangDoi_Id).
 * Bổ sung cho Tivi CĐHA "1 phòng/màn" (có dropdown chọn phòng).
 */
export default function TiviCDHATongHop() {
  const [info, setInfo] = useState(null);
  const [marquee, setMarquee] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [g, i] = await Promise.all([
          http.get("/common/gioi-thieu"),
          http.get("/user/info"),
        ]);
        setMarquee(
          g?.data?.NoiDungGioiThieu ||
            "BỆNH VIỆN Y HỌC CỔ TRUYỀN ĐÀ NẴNG - KHU CHẨN ĐOÁN HÌNH ẢNH",
        );
        setInfo(i?.data || null);
      } catch (e) {
        console.error("Lỗi khởi tạo Tivi CĐHA tổng hợp:", e);
      }
    })();
  }, []);

  // Mỗi phòng CĐHA → hàng đợi của nó (PHONG_BAN_HANG_DOI). Bỏ phòng không map.
  const rooms = useMemo(() => {
    const allowed = MODULE_PHONG_BAN.cdha || [];
    return (info?.PhongBanList || [])
      .filter((p) => allowed.includes(Number(p.FieldCode)))
      .map((p) => ({
        room: p,
        hangDoiId: (PHONG_BAN_HANG_DOI[Number(p.FieldCode)] || [])[0],
      }))
      .filter((x) => x.hangDoiId);
  }, [info]);

  // Refresh khi có sự kiện hàng đợi (socket) hoặc định kỳ 20s.
  const { isConnected, subscribe } = useSocket();
  useEffect(() => {
    if (!isConnected) return undefined;
    const sub = subscribe("/topic/messages", (d) => {
      if (EVENTS_NEED_REFRESH.has(d?.event)) setTick((t) => t + 1);
    });
    return () => sub?.unsubscribe();
  }, [isConnected, subscribe]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 20000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          background: "linear-gradient(90deg, #0d1b2e 0%, #003a8c 100%)",
          color: "#fff",
          padding: "2.4vh 3vw",
          fontSize: "3.4vh",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textAlign: "center",
        }}
      >
        KHU CHẨN ĐOÁN HÌNH ẢNH
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gridAutoRows: "1fr",
          gap: "2vh",
          padding: "3vh 3vw",
          overflow: "hidden",
        }}
      >
        {rooms.map((x) => (
          <RoomCell
            key={x.room.FieldCode}
            room={x.room}
            hangDoiId={x.hangDoiId}
            tick={tick}
          />
        ))}
        {rooms.length === 0 && (
          <div style={{ color: "var(--color-text-muted)", fontSize: "2.4vh" }}>
            Chưa cấu hình phòng CĐHA
          </div>
        )}
      </div>
      <TiviFooter marqueeText={marquee} />
    </div>
  );
}
