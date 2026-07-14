import { FullscreenOutlined } from "@ant-design/icons";
import { Button, Card, Select } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EVENTS_NEED_REFRESH,
  MODULE_PHONG_BAN,
  PHONG_BAN_HANG_DOI,
} from "../../../const/const";
import http from "../../../util/httpClient";

import TiviFooter from "../../../component/TiviFooter";
import TiviLeftPanel from "../../../component/TiviLeftPanel";
import WaitTimeBadge from "../../../component/WaitTimeBadge";
import { useTiviSocket } from "../../../hooks/useTiviSocket";
import "./TiviCDHA.scss";

const MODULE_KEY = "cdha";

const TiviCDHA = () => {
  const [currentTicket, setCurrentTicket] = useState(null);
  const [waitingList, setWaitingList] = useState("");
  const [marqueeText, setMarqueeText] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  // Phòng CĐHA đang hiển thị trên màn này — có dropdown đổi phòng (option chọn màn).
  const [selectedPbCode, setSelectedPbCode] = useState(null);

  // Danh sách phòng CĐHA (lọc từ info theo module).
  const rooms = useMemo(() => {
    const allowedPB = MODULE_PHONG_BAN[MODULE_KEY] || [];
    return (info?.PhongBanList || []).filter((p) =>
      allowedPB.includes(Number(p.FieldCode)),
    );
  }, [info]);

  // Mặc định chọn phòng đầu tiên khi có dữ liệu.
  useEffect(() => {
    if (rooms.length > 0 && selectedPbCode == null) {
      setSelectedPbCode(Number(rooms[0].FieldCode));
    }
  }, [rooms, selectedPbCode]);

  // effectiveInfo theo PHÒNG đang chọn — HangDoi suy ra từ PHONG_BAN_HANG_DOI
  // (mỗi phòng 1 hàng đợi riêng → số gọi + dự báo riêng).
  const effectiveInfo = useMemo(() => {
    if (!info || selectedPbCode == null) return null;
    const pb = rooms.find((p) => Number(p.FieldCode) === selectedPbCode) || null;
    const hdCode = (PHONG_BAN_HANG_DOI[selectedPbCode] || [])[0];
    const hd =
      (info.HangDoiList || []).find((h) => Number(h.FieldCode) === hdCode) ||
      (hdCode ? { FieldCode: hdCode, FieldName: "" } : null);
    return { ...info, HangDoi: hd, PhongBan: pb };
  }, [info, rooms, selectedPbCode]);

  //data chính
  const fetchData = useCallback(async (info) => {
    const hangDoiId = info?.HangDoi?.FieldCode;
    const phongBanId = info?.PhongBan?.FieldCode;
    if (!phongBanId || !hangDoiId) return;

    try {
      const [displayRes, waitingRes] = await Promise.all([
        http.get("/cls/dang-goi", {
          phongBanId: phongBanId,
          hangDoiId: hangDoiId,
        }),
        http.get("/cls/chay-chu-ds-cho", {
          hangDoiId: hangDoiId,
        }),
      ]);
      const dataList = displayRes?.data || [];
      setCurrentTicket(
        dataList.length > 0 ? dataList[0] : { TENBENHNHAN: "", STT: "---" },
      );

      const waitingData = waitingRes?.data || [];
      setWaitingList(
        waitingData.length > 0 ? waitingData[0].TenBenhNhan || "" : "",
      );
    } catch (error) {
      console.error("Lỗi cập nhật dữ liệu Tivi:", error);
    }
  }, []);

  // === SOCKET ===
  useTiviSocket({ info: effectiveInfo, fetchData, EVENTS_NEED_REFRESH });
  //end SOCKET

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
      } catch (err) {
        console.error("Lỗi khởi tạo:", err);
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
    <div id="tivi-cdha">
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
          <TiviLeftPanel />
        </div>

        {/* Phần bên phải */}
        <div className="right-panel">
          {rooms.length > 1 && (
            <div style={{ position: "absolute", top: "2vh", right: "3vw", zIndex: 20 }}>
              <Select
                value={selectedPbCode}
                onChange={setSelectedPbCode}
                size="large"
                style={{ minWidth: 240 }}
                options={rooms.map((r) => ({
                  value: Number(r.FieldCode),
                  label: r.FieldName,
                }))}
              />
            </div>
          )}
          <div className="current-number-section">
            <div className="room-title">
              {effectiveInfo?.PhongBan?.FieldName ||
                effectiveInfo?.PhongBan?.TenPhongBanDayDu ||
                "---"}
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

          <div className="waiting-header">BỆNH NHÂN CHỜ</div>
          <div className="waiting-section-vertical">
            <div className="waiting-list-container">
              {waitingItems.length > 0 ? (
                waitingItems.slice(0, 3).map((stt, index) => (
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

export default TiviCDHA;
