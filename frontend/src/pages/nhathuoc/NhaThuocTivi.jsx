import { FullscreenOutlined } from "@ant-design/icons";
import { Button, Card, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import TiviFooter from "../../component/TiviFooter";
import TiviLeftPanel from "../../component/TiviLeftPanel";
import WaitTimeBadge from "../../component/WaitTimeBadge";
import { EVENTS_NEED_REFRESH, MODULE_HANG_DOI, MODULE_PHONG_BAN } from "../../const/const";
import { useTiviSocket } from "../../hooks/useTiviSocket";
import http from "../../util/httpClient";
import "./NhaThuocTivi.scss";

const MODULE_KEY = "nhaThuoc";

const NhaThuocTivi = () => {
  const [currentTicket, setCurrentTicket] = useState(null);
  const [waitingList, setWaitingList] = useState("");
  const [marqueeText, setMarqueeText] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);

  // ADMIN bypass trả tất cả → lọc theo module để Tivi chọn đúng HD/PB.
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

  const fetchData = useCallback(async (currentInfo) => {
    if (!currentInfo?.PhongBan?.FieldCode || !currentInfo?.HangDoi?.FieldCode)
      return;

    try {
      const [displayRes, waitingRes] = await Promise.all([
        http.get("/vien-phi/dang-goi", {
          phongBanId: currentInfo.PhongBan.FieldCode,
          hangDoiId: currentInfo.HangDoi.FieldCode,
        }),
        http.get("/vien-phi/chay-chu-ds-cho", {
          hangDoiId: currentInfo.HangDoi.FieldCode,
        }),
      ]);

      const dataList = displayRes?.data || [];
      setCurrentTicket(
        dataList.length > 0 ? dataList[0] : { TENBENHNHAN: "---", STT: "---" },
      );

      const waitingData = waitingRes?.data || [];
      setWaitingList(
        waitingData.length > 0 ? waitingData[0].TenBenhNhan || "" : "",
      );
    } catch (error) {
      console.error("Lỗi cập nhật dữ liệu Tivi Nhà thuốc:", error);
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

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [gioiThieuRes, infoRes] = await Promise.all([
          http.get("/common/gioi-thieu"),
          http.get("/user/info"),
        ]);

        const marqueeContent =
          gioiThieuRes?.data?.NoiDungGioiThieu ||
          "BỆNH VIỆN Y HỌC CỔ TRUYỀN ĐÀ NẴNG - KHOA DƯỢC";

        setMarqueeText(marqueeContent);
        setInfo(infoRes?.data || null);
      } catch (err) {
        message.error("Lỗi khởi tạo: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .catch((e) => console.error(e));
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const waitingItems = (typeof waitingList === "string" ? waitingList : "")
    .split(/\r\n|\r|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (loading) return <></>;

  return (
    <div id="nhathuoc-tivi">
      <Button
        className="fullscreen-btn"
        type="primary"
        shape="circle"
        icon={<FullscreenOutlined />}
        onClick={toggleFullScreen}
      />

      <div className="tivi-body">
        <div className="left-panel">
          <TiviLeftPanel />
        </div>

        <div className="right-panel">
          <div className="current-number-section">
            <div className="module-title">NHÀ THUỐC</div>
            <div className="room-title">
              {effectiveInfo?.PhongBan?.FieldName
                ? `Quầy: ${effectiveInfo.PhongBan.FieldName}`
                : "Chưa cấu hình phòng ban"}
            </div>
            <Card className="big-info-card" variant="borderless">
              <div className="stt-number">{currentTicket?.STT || "---"}</div>
              <div className="patient-name">
                {currentTicket?.TENBENHNHAN || "---"}
              </div>
            </Card>
          </div>

          {effectiveInfo?.HangDoi?.FieldCode && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <WaitTimeBadge
                hangDoiId={Number(effectiveInfo?.HangDoi?.FieldCode)}
                variant="tivi"
              />
            </div>
          )}

          <div className="waiting-header">ĐƠN THUỐC CHỜ</div>
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
        </div>
      </div>

      <TiviFooter marqueeText={marqueeText} info={effectiveInfo} />
    </div>
  );
};

export default NhaThuocTivi;
