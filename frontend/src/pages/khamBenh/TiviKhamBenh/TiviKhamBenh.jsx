import { FullscreenOutlined } from "@ant-design/icons";
import { Button, Card, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import img_tiepnhan from "../../../assets/images/img_tiepnhan.png";
import Time from "../../../component/Time";
import WaitTimeBadge from "../../../component/WaitTimeBadge";
import { EVENTS_NEED_REFRESH, MODULE_HANG_DOI, MODULE_PHONG_BAN } from "../../../const/const";
import http from "../../../util/httpClient";

import { useTiviSocket } from "../../../hooks/useTiviSocket";
import "./TiviKhamBenh.scss";

const MODULE_KEY = "khamBenh";

const TiviKhamBenh = () => {
  // --- State ---
  const [currentTicket, setCurrentTicket] = useState(null);
  const [waitingList, setWaitingList] = useState("");
  const [marqueeText, setMarqueeText] = useState("");
  const [tenBacSi, setTenBacSi] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);

  // ADMIN bypass trả về TẤT CẢ HangDoi/PhongBan → nếu lấy info.HangDoi thẳng
  // sẽ ra HangDoi=1 (Tiếp Nhận), mọi Tivi cùng hiện STT 1xxx. Lọc theo module
  // để Tivi Khám bệnh chỉ chọn HD=3 + 1 phòng khám (mặc định PK1).
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

  //data chính
  const fetchData = useCallback(async (currentInfo) => {
    const hangDoiId = currentInfo?.HangDoi?.FieldCode;
    const phongBanId = currentInfo?.PhongBan?.FieldCode;
    if (!phongBanId || !hangDoiId) return;

    try {
      const [displayRes, waitingRes] = await Promise.all([
        http.get("/kham-benh/dang-goi", {
          phongBanId: phongBanId,
          hangDoiId: hangDoiId,
        }),
        http.get("/kham-benh/hang-cho-tivi", {
          hangDoiId: hangDoiId,
        }),
      ]);
      const dataList = displayRes?.data || [];
      setCurrentTicket(
        dataList.length > 0 ? dataList[0] : { TENBENHNHAN: "---", STT: "---" },
      );

      const waitingData = waitingRes?.data || [];
      setWaitingList(
        waitingData.length > 0 ? waitingData[0].TENBENHNHAN || "" : "",
      );
    } catch (error) {
      console.log(error);
      message.error("Lỗi cập nhật dữ liệu Tivi: " + error.message);
    }
  }, []);

  useTiviSocket({
    info: effectiveInfo,
    fetchData,
    EVENTS_NEED_REFRESH,
  });

  useEffect(() => {
    if (!effectiveInfo) return;
    fetchData(effectiveInfo);
  }, [effectiveInfo, fetchData]);

  //init data
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [gioiThieuRes, infoRes] = await Promise.all([
          http.get("/common/gioi-thieu"),
          http.get("/user/info"),
        ]);
        let marqueeContent =
          gioiThieuRes?.data?.NoiDungGioiThieu ||
          "BỆNH VIỆN Y HỌC CỔ TRUYỀN ĐÀ NẴNG - KÍNH CHÀO QUÝ KHÁCH";
        setMarqueeText(marqueeContent);
        setInfo(infoRes?.data || null);
        const tenBacSi = localStorage.getItem("tenBacSi") || "";
        setTenBacSi(tenBacSi);
      } catch (err) {
        message.error("Lỗi khởi tạo: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [fetchData]);
  //end init data

  //---------HANDLER---------------
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .catch((e) => console.error(e));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const waitingItems = (typeof waitingList === "string" ? waitingList : "")
    .split(/\r\n|\r|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  // loading không làm gì cả
  if (loading) return <></>;

  return (
    <div id="tivi-khambenh">
      <Button
        className="fullscreen-btn"
        type="primary"
        shape="circle"
        icon={<FullscreenOutlined />}
        onClick={toggleFullScreen}
      />

      <div className="tivi-body">
        {/* Phần bên trái */}
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

        {/* Phần bên phải */}
        <div className="right-panel">
          <div className="current-number-section">
            <div className="room-title">BÁC SĨ: {tenBacSi || "---"}</div>
            <Card className="big-info-card" variant="borderless">
              <div className="stt-number">{currentTicket?.STT || "---"}</div>
              <div className="patient-name">
                {currentTicket?.TENBENHNHAN || "---"}
              </div>
            </Card>
          </div>

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
      </div>

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

export default TiviKhamBenh;
