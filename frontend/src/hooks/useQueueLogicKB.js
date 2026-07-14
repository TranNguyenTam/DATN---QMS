import { message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EVENTS_NEED_REFRESH, MODULE_HANG_DOI, MODULE_PHONG_BAN } from "../const/const";
import http from "../util/httpClient";
import { useSocket } from "./useSocket";
import { useVoiceAnnouncement } from "./useVoiceAnnouncement";

const MODULE_KEY = "khamBenh";

export const useQueueLogicKB = () => {
  const [info, setInfo] = useState(null);
  const [selectedHangDoi, setSelectedHangDoi] = useState(null);
  const [selectedPhongBan, setSelectedPhongBan] = useState(null);
  const [dsHangCho, setDsHangCho] = useState([]);
  const [dsDaGoi, setDsDaGoi] = useState([]);
  const [benhNhanMoi, setBenhNhanMoi] = useState(null);
  const [initDevices, setInitDevices] = useState([]);
  const [loadingInit, setLoadingInit] = useState(false);
  const [loading, setLoading] = useState(false);
  const { announce } = useVoiceAnnouncement();

  // Load user info + devices + tự filter hàng đợi theo module ("khamBenh").
  useEffect(() => {
    const initData = async () => {
      try {
        setLoadingInit(true);
        const [infoRes, deviceRes] = await Promise.all([
          http.get("/user/info"),
          http.get("/common/device"),
        ]);
        if (infoRes?.data) {
          setInfo(infoRes.data);
        }
        if (deviceRes?.data) setInitDevices(deviceRes.data);
      } catch (error) {
        console.error("Lỗi init:", error);
      } finally {
        setLoadingInit(false);
      }
    };
    initData();
  }, []);

  // Lọc danh sách hàng đợi đúng module này.
  const moduleHangDoiList = useMemo(() => {
    const allowed = MODULE_HANG_DOI[MODULE_KEY] || [];
    const list = info?.HangDoiList || [];
    return list.filter((h) => allowed.includes(Number(h.FieldCode)));
  }, [info]);

  // Filter phòng theo module — Khám bệnh chỉ thấy phòng khám (PK1/2/3/KYC/KNP).
  const modulePhongBanList = useMemo(() => {
    const allowed = MODULE_PHONG_BAN[MODULE_KEY] || [];
    const list = info?.PhongBanList || [];
    return list.filter((p) => allowed.includes(Number(p.FieldCode)));
  }, [info]);

  // Auto-select cặp mặc định: hàng đợi đầu tiên khớp module + phòng đầu tiên.
  useEffect(() => {
    if (moduleHangDoiList.length > 0 && !selectedHangDoi) {
      setSelectedHangDoi(moduleHangDoiList[0]);
    }
    if (modulePhongBanList.length > 0 && !selectedPhongBan) {
      setSelectedPhongBan(modulePhongBanList[0]);
    }
  }, [moduleHangDoiList, modulePhongBanList, selectedHangDoi, selectedPhongBan]);

  // 2. Fetch Data Core
  const fetchData = useCallback(async () => {
    if (!selectedHangDoi?.FieldCode) return;
    const hangDoiId = selectedHangDoi.FieldCode;
    const phongBanId = selectedPhongBan?.FieldCode;
    setLoading(true);
    try {
      const [waitingRes, daGoiRes, bnMoiRes] = await Promise.all([
        http.get("/kham-benh/hang-cho", { hangDoiId }),
        http.get("/kham-benh/da-goi", { hangDoiId, phongBanId }),
        http.get("/kham-benh/dang-goi", { phongBanId, hangDoiId }),
      ]);
      const nextDsHangCho = waitingRes?.data || [];
      const nextDsDaGoi = daGoiRes?.data || [];
      const nextBenhNhanMoi = bnMoiRes?.data?.[0] || null;
      setDsHangCho(nextDsHangCho);
      // "Đã gọi": số VỪA GỌI (STT lớn nhất) lên TRÊN CÙNG.
      setDsDaGoi(
        [...nextDsDaGoi].sort(
          (a, b) =>
            (Number(String(b.SoThuTuDayDu ?? b.STT ?? "").replace(/\D/g, "")) || 0) -
            (Number(String(a.SoThuTuDayDu ?? a.STT ?? "").replace(/\D/g, "")) || 0),
        ),
      );
      setBenhNhanMoi(nextBenhNhanMoi);
      return {
        benhNhanMoi: nextBenhNhanMoi,
        dsHangCho: nextDsHangCho,
        dsDaGoi: nextDsDaGoi,
      };
    } catch (error) {
      console.error(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedHangDoi, selectedPhongBan]);

  useEffect(() => {
    if (selectedHangDoi && selectedPhongBan) fetchData();
  }, [selectedHangDoi, selectedPhongBan, fetchData]);

  const { isConnected, subscribe, unsubscribe } = useSocket();
  useEffect(() => {
    if (!isConnected) return;
    const __sub = subscribe("/topic/messages", async (data) => {
      const shouldRefresh =
        EVENTS_NEED_REFRESH.has(data?.event) &&
        (data?.hangDoiId === selectedHangDoi?.FieldCode ||
          data?.phongBanId === selectedPhongBan?.FieldCode);
      if (shouldRefresh) {
        await fetchData();
      }
    });
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, fetchData, selectedHangDoi, selectedPhongBan]);

  // 4. Actions
  const handleGoiBn = async () => {
    if (!selectedHangDoi) return message.warning("Chưa chọn hàng đợi!");
    if (dsHangCho.length === 0) return message.warning("Hết bệnh nhân!");
    try {
      const res = await http.post("/kham-benh/goi-bn", {
        phongBanId: selectedPhongBan?.FieldCode,
        hangDoiId: selectedHangDoi?.FieldCode,
      });
      if (res?.data?.length > 0) {
        message.success("Đã gọi số tiếp theo");
        const bn = res.data[0] || {};
        const stt = bn?.SoThuTuDayDu || bn?.STT || benhNhanMoi?.SoThuTuDayDu;
        const ten = bn?.TenBenhNhan || benhNhanMoi?.TenBenhNhan || "benh nhan";
        const phong = selectedPhongBan?.FieldName || "phong kham";
        announce(`Mời bệnh nhân số ${stt}, ${ten}, vào ${phong}.`);
      } else {
        message.warning("Hết bệnh nhân!");
      }
    } catch (e) {
      message.error(e.message || "Lỗi gọi bệnh nhân");
    }
  };

  const handleBoQua = async (record) => {
    try {
      const res = await http.put("/kham-benh/bo-qua", {
        hangDoiPhongBanId: record.HangDoiPhongBan_Id,
        phongBanId: selectedPhongBan?.FieldCode,
      });
      if (res && res.data.length > 0) {
        message.warning(
          `Đã bỏ qua: ${record.TenBenhNhan} - (${record.SoThuTuDayDu})`,
        );
      } else {
        message.error("Bỏ qua không thành công");
      }
    } catch (e) {
      message.error(e.message || "Lỗi bỏ qua bệnh nhân");
    }
  };

  const handleGoiLai = async (record) => {
    try {
      const qs = new URLSearchParams({
        phongBanId: selectedPhongBan?.FieldCode ?? "",
        hangDoiId: selectedHangDoi?.FieldCode ?? "",
      }).toString();
      const res = await http.post(
        `/kham-benh/goi-lai/${record.HangDoiPhongBan_Id}?${qs}`,
      );
      if (res?.data?.length > 0) {
        message.success(
          `Đã gọi lại: ${record.TenBenhNhan} - (${record.SoThuTuDayDu})`,
        );
        const stt = record?.SoThuTuDayDu || benhNhanMoi?.SoThuTuDayDu;
        const ten =
          record?.TenBenhNhan || benhNhanMoi?.TenBenhNhan || "benh nhan";
        const phong = selectedPhongBan?.FieldName || "phong kham";
        announce(`Mời bệnh nhân số ${stt}, ${ten}, vào ${phong}.`);
      } else {
        message.warning("Không thể gọi lại bệnh nhân.");
      }
    } catch (e) {
      message.error(e.message || "Lỗi gọi lại");
    }
  };

  return {
    info,
    selectedHangDoi,
    selectedPhongBan,
    setSelectedHangDoi,
    setSelectedPhongBan,
    moduleHangDoiList,
    modulePhongBanList,
    dsHangCho,
    dsDaGoi,
    benhNhanMoi,
    initDevices,
    loading,
    loadingInit,
    actions: { handleGoiBn, handleBoQua, handleGoiLai, refresh: fetchData },
  };
};
