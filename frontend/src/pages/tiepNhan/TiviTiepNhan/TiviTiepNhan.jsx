import { LogoutOutlined } from "@ant-design/icons";
import { Button, Card } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import img_tiepnhan from "../../../assets/images/img_tiepnhan.png";
import Time from "../../../component/Time";
import WaitTimeBadge from "../../../component/WaitTimeBadge";
import { EVENTS_NEED_REFRESH, MODULE_HANG_DOI, MODULE_PHONG_BAN } from "../../../const/const";
import { useSocket } from "../../../hooks/useSocket";
import { logout } from "../../../store/slices/authSlice";
import http from "../../../util/httpClient";
import "./TiviTiepNhan.scss";

const MODULE_KEY = "tiepNhan";

const TiviTiepNhan = () => {
  // --- State ---
  const [displayData, setDisplayData] = useState([]);
  const [waitingList, setWaitingList] = useState("");
  const [marqueeText, setMarqueeText] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // ADMIN bypass trả tất cả → lọc theo module (HD 1/2/11 + PB 1) để Tivi
  // Tiếp Nhận chắc chắn không bị "chen" số từ HangDoi khác trong list.
  const effectiveInfo = useMemo(() => {
    if (!info) return null;
    const allowedHD = MODULE_HANG_DOI[MODULE_KEY] || [];
    const allowedPB = MODULE_PHONG_BAN[MODULE_KEY] || [];
    const hd = (info.HangDoiList || []).find((h) =>
      allowedHD.includes(Number(h.FieldCode)),
    );
    const pb = (info.PhongBanList || []).find((p) =>
      allowedPB.includes(Number(p.FieldCode)),
    );
    return { ...info, HangDoi: hd || info.HangDoi, PhongBan: pb || info.PhongBan };
  }, [info]);

  const normalizeId = (value) => {
    if (value == null) return null;
    const asNumber = Number(value);
    return Number.isNaN(asNumber) ? String(value) : asNumber;
  };

  console.log(info);

  const fetchData = useCallback(async (info) => {
    try {
      const [displayRes, waitingRes] = await Promise.all([
        http.get("/kiosk/queue-display", {
          phongBanId: info?.PhongBan?.FieldCode,
        }),
        http.get("/kiosk/waiting", { hangDoiId: info?.HangDoi?.FieldCode }),
      ]);

      setDisplayData(displayRes?.data || [{ TenQuayTiepNhan: "", STT: "" }]);
      const waitingData = waitingRes?.data || [];
      setWaitingList(waitingData.length > 0 ? waitingData[0].DL : "Trống");
    } catch (error) {
      console.error("Lỗi cập nhật dữ liệu Tivi:", error);
    }
  }, []);

  //socket
  const { isConnected, sendMessage, subscribe, unsubscribe } = useSocket();
  useEffect(() => {
    const deviceName =
      effectiveInfo?.Devices?.TenTivi?.trim() || effectiveInfo?.Devices?.UserCode?.trim();
    if (!isConnected || !effectiveInfo || !deviceName) return;

    sendMessage("/app/device/register", {
      deviceName,
      deviceType: "TV",
    });
  }, [isConnected, sendMessage, effectiveInfo]);

  useEffect(() => {
    if (!isConnected) return;

    const __sub = subscribe("/topic/messages", (data) => {
      const eventHangDoiId = normalizeId(data?.hangDoiId);
      const eventPhongBanId = normalizeId(data?.phongBanId);
      const currentHangDoiId = normalizeId(effectiveInfo?.HangDoi?.FieldCode);
      const currentPhongBanId = normalizeId(effectiveInfo?.PhongBan?.FieldCode);

      const hangDoiMatch =
        eventHangDoiId != null && eventHangDoiId === currentHangDoiId;
      const phongBanMatch =
        eventPhongBanId != null && eventPhongBanId === currentPhongBanId;

      if (
        EVENTS_NEED_REFRESH.has(data?.event) &&
        (hangDoiMatch || phongBanMatch)
      ) {
        fetchData(effectiveInfo);
      }
    });
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, fetchData, effectiveInfo]);
  //end socket

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [gioiThieuRes, infoRes] = await Promise.all([
          http.get("/common/gioi-thieu"),
          http.get("/user/info"),
        ]);
        if (infoRes?.data) setInfo(infoRes.data);
        let marqueeContent =
          gioiThieuRes?.data?.NoiDungGioiThieu ||
          "BỆNH VIỆN Y HỌC CỔ TRUYỀN ĐÀ NẴNG - KÍNH CHÀO QUÝ KHÁCH";
        setMarqueeText(marqueeContent);
      } catch (err) {
        console.error("Lỗi khởi tạo:", err);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [fetchData]);

  useEffect(() => {
    if (effectiveInfo) {
      fetchData(effectiveInfo);
    }
  }, [effectiveInfo, fetchData]);

  // --- Logic Mode ---
  const viewMode = useMemo(() => {
    if (displayData.length === 0 && !waitingList) return "IDLE";
    if (displayData.length === 1) return "SPLIT";
    return "GRID";
  }, [displayData, waitingList]);

  // Class hỗ trợ chỉnh font size dựa trên số lượng phần tử
  const getDensityClass = () => {
    const len = displayData.length;
    if (len <= 2) return "density-low"; // 1 hàng
    if (len <= 4) return "density-medium"; // 2 hàng
    if (len <= 6) return "density-high"; // 3 hàng
    return "density-super-high"; // 4 hàng
  };

  const handleLogout = () => {
    if (window.confirm("Bạn muốn đăng xuất không?")) {
      dispatch(logout());
      navigate("/login", { replace: true });
    }
  };

  const waitingItems = (typeof waitingList === "string" ? waitingList : "")
    .split(/\r\n|\r|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (loading) return <></>;

  return (
    <div
      id="tivi-tiepnhan"
      className={`mode-${viewMode.toLowerCase()} ${getDensityClass()}`}
    >
      <Button
        className="fullscreen-btn"
        type="primary"
        shape="circle"
        icon={<LogoutOutlined />}
        onClick={handleLogout}
      />

      <div className="tivi-body">
        {/* --- Phần bên trái --- */}
        {viewMode !== "GRID" && (
          <div className="left-panel">
            <div className="header-section">
              <div className="logo-box">
                <img src="/logoYHCT.png" alt="Logo" />
              </div>
              <div className="hospital-name">
                <h3>BỆNH VIỆN</h3>
                <h2>Y HỌC CỔ TRUYỀN ĐÀ NẴNG</h2>
              </div>
            </div>
            <div className="video-section">
              <img
                className="video-content"
                src={img_tiepnhan}
                alt="Bệnh viện Y học cổ truyền Đà Nẵng"
              />
            </div>
          </div>
        )}

        {/* --- Phần bên phải --- */}
        {viewMode !== "IDLE" && (
          <div className="right-panel">
            {viewMode === "SPLIT" ? (
              // --- GIAO DIỆN CHUẨN (1 Quầy) ---
              <div className="current-number-section">
                <div className="room-title">
                  {displayData[0]?.TenQuayTiepNhan?.toUpperCase() ||
                    "KHU VỰC TIẾP NHẬN"}
                </div>
                <Card className="big-info-card" variant="borderless">
                  <div className="stt-number">
                    {displayData[0]?.STT || "---"}
                  </div>
                  <div className="patient-name">---</div>
                </Card>
              </div>
            ) : (
              // --- GIAO DIỆN GRID (Nhiều Quầy) ---
              <div className="grid-container-custom">
                <div className="grid-header-standard">
                  <div className="header-logo">
                    <img src="/logoYHCT.png" alt="Logo" />
                  </div>
                  <div className="header-text">
                    <h2>BỆNH VIỆN Y HỌC CỔ TRUYỀN ĐÀ NẴNG</h2>
                    <h1>KHU VỰC TIẾP NHẬN</h1>
                  </div>
                </div>
                <div className="grid-content-standard">
                  {displayData.map((item, index) => (
                    <div key={index} className="grid-item-standard">
                      <Card className="small-info-card" variant="borderless">
                        <div className="quay-name">{item.TenQuayTiepNhan}</div>
                        <div className="stt-value">{item.STT || "---"}</div>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Danh sách chờ chuẩn */}
            <div className="waiting-header">BỆNH NHÂN CHỜ</div>
            <div className="waiting-section-vertical">
              <div className="waiting-list-container">
                {waitingItems.length > 0 ? (
                  waitingItems.map((stt, index) => (
                    <div key={index} className="waiting-item">
                      {stt}
                    </div>
                  ))
                ) : (
                  <div className="waiting-item">---</div>
                )}
              </div>
            </div>

            {effectiveInfo?.HangDoi?.FieldCode && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <WaitTimeBadge
                  hangDoiId={Number(effectiveInfo.HangDoi.FieldCode)}
                  variant="tivi"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer chuẩn */}
      <div className="tivi-footer">
        <div className="time-box">
          <Time
            style={{ fontSize: "4vh", fontWeight: "bold", color: "#ffffff" }}
          />
        </div>
        <div className="marquee-box">
          <div className="marquee-text">{marqueeText}</div>
        </div>
      </div>
    </div>
  );
};

export default TiviTiepNhan;
