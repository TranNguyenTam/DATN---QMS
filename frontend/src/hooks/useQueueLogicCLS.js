import { message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EVENTS_NEED_REFRESH, MODULE_HANG_DOI, MODULE_PHONG_BAN, PHONG_BAN_HANG_DOI } from "../const/const";
import http from "../util/httpClient";
import { useSocket } from "./useSocket";
import { useVoiceAnnouncement } from "./useVoiceAnnouncement";

// moduleKey: "cls" (mặc định) hoặc "cdha" — hook share giữa phòng lấy mẫu + CDHA.
export const useQueueLogicCLS = (moduleKey = "cls") => {
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

  useEffect(() => {
    const initData = async () => {
      try {
        setLoadingInit(true);
        const [infoRes, deviceRes] = await Promise.all([
          http.get("/user/info"),
          http.get("/common/device"),
        ]);
        if (infoRes?.data) setInfo(infoRes.data);
        if (deviceRes?.data) setInitDevices(deviceRes.data);
      } catch (error) {
        console.error("Lỗi init:", error);
      } finally {
        setLoadingInit(false);
      }
    };
    initData();
  }, []);

  // Hàng đợi cho phép = (hàng đợi user được gán ∩ module) ∩ hàng đợi của PHÒNG đang chọn.
  // Ràng theo phòng (PHONG_BAN_HANG_DOI) để không gọi nhầm hàng đợi của phòng
  // khác — vd đứng ở Phòng Siêu Âm 2 thì chỉ thấy hàng đợi Siêu âm, không thấy CT.
  // Phòng không có trong map ⇒ allowedByPhong = null ⇒ không siết.
  const moduleHangDoiList = useMemo(() => {
    const allowedModule = MODULE_HANG_DOI[moduleKey] || [];
    const pbCode = Number(selectedPhongBan?.FieldCode);
    const allowedByPhong = pbCode ? PHONG_BAN_HANG_DOI[pbCode] : null;
    const list = info?.HangDoiList || [];
    return list.filter((h) => {
      const code = Number(h.FieldCode);
      if (!allowedModule.includes(code)) return false;
      if (allowedByPhong && !allowedByPhong.includes(code)) return false;
      return true;
    });
  }, [info, moduleKey, selectedPhongBan]);

  // Filter phòng theo module: CLS = Phòng Lấy Mẫu XN; CDHA = SiêuÂm/XQuang/CT/Đo loãng xương.
  const modulePhongBanList = useMemo(() => {
    const allowed = MODULE_PHONG_BAN[moduleKey] || [];
    const list = info?.PhongBanList || [];
    return list.filter((p) => allowed.includes(Number(p.FieldCode)));
  }, [info, moduleKey]);

  // Mặc định chọn phòng đầu tiên của module.
  useEffect(() => {
    if (modulePhongBanList.length > 0 && !selectedPhongBan) {
      setSelectedPhongBan(modulePhongBanList[0]);
    }
  }, [modulePhongBanList, selectedPhongBan]);

  // Đồng bộ hàng đợi theo phòng: khi đổi phòng làm hàng đợi đang chọn không
  // còn hợp lệ (hoặc chưa chọn) → chọn lại hàng đợi đầu tiên hợp lệ; nếu phòng
  // không có hàng đợi nào được gán → bỏ chọn.
  useEffect(() => {
    const validCodes = moduleHangDoiList.map((h) => Number(h.FieldCode));
    const curCode = Number(selectedHangDoi?.FieldCode);
    if (moduleHangDoiList.length === 0) {
      if (selectedHangDoi) setSelectedHangDoi(null);
    } else if (!validCodes.includes(curCode)) {
      setSelectedHangDoi(moduleHangDoiList[0]);
    }
  }, [moduleHangDoiList, selectedHangDoi]);

  const fetchData = useCallback(async () => {
    if (!selectedHangDoi?.FieldCode) return;
    const hangDoiId = selectedHangDoi.FieldCode;
    const phongBanId = selectedPhongBan?.FieldCode;
    setLoading(true);
    try {
      const [waitingRes, daGoiRes, bnMoiRes] = await Promise.all([
        http.get("/cls/hang-cho", { hangDoiId }),
        http.get("/cls/da-goi", { hangDoiId, phongBanId }),
        http.get("/cls/dang-goi", { phongBanId, hangDoiId }),
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
      if (shouldRefresh) await fetchData();
    });
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, fetchData, selectedHangDoi, selectedPhongBan]);

  // 4. Actions
  const handleGoiBn = async () => {
    if (!selectedHangDoi) return message.warning("Chưa chọn hàng đợi!");
    try {
      const res = await http.post("/cls/goi-bn", {
        phongBanId: selectedPhongBan?.FieldCode,
        hangDoiId: selectedHangDoi?.FieldCode,
        hangDoiPhongBanId: benhNhanMoi?.HangDoiPhongBan_Id,
      });
      if (res?.data?.length > 0) {
        message.success("Đã gọi số tiếp theo");
        const bn = res.data[0] || {};
        const stt = bn?.SoThuTuDayDu || bn?.STT || benhNhanMoi?.SoThuTuDayDu;
        const ten = bn?.TenBenhNhan || benhNhanMoi?.TenBenhNhan || "benh nhan";
        const phong = selectedPhongBan?.FieldName || "phong can lam sang";
        announce(`Mời bệnh nhân số ${stt}, ${ten}, vào ${phong}.`);
        await fetchData(); // refresh ĐANG GỌI + hàng chờ + đã gọi ngay (không đợi socket)
      } else {
        message.warning("Có lỗi vui lòng thử lại");
      }
    } catch (e) {
      message.error(e.message || "Lỗi gọi bệnh nhân");
    }
  };

  const handleBoQua = async (record) => {
    try {
      const res = await http.put("/cls/bo-qua", {
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
      message.error(e.message || "Lỗi bỏ qua");
    }
  };

  const handleGoiLai = async (record) => {
    try {
      const res = await http.post("/cls/goi-lai/" + record.HangDoiPhongBan_Id);
      if (res?.data?.length > 0) {
        message.success(
          `Đã gọi lại: ${record.TenBenhNhan} - (${record.SoThuTuDayDu})`,
        );
        const stt = record?.SoThuTuDayDu || benhNhanMoi?.SoThuTuDayDu;
        const ten =
          record?.TenBenhNhan || benhNhanMoi?.TenBenhNhan || "benh nhan";
        const phong = selectedPhongBan?.FieldName || "phong can lam sang";
        announce(`Mời bệnh nhân số ${stt}, ${ten}, vào ${phong}.`);
      } else {
        message.warning("Không thể gọi lại bệnh nhân.");
      }
    } catch (e) {
      message.error(e.message || "Lỗi gọi lại");
    }
  };

  const handleInsertVP = async (barcode) => {
    try {
      const res = await http.get(`/cls/check-barcode`, {
        soPhieu: barcode,
        hangDoiId: selectedHangDoi?.FieldCode,
      });

      if (!res.data || !res.data.length > 0) {
        message.error("Mã barcode không hợp lệ hoặc không tìm thấy phiếu");
        return;
      }
      console.log(res.data);

      const {
        BenhNhan_Id,
        UuTien,
        LoaiPhieu,
        NoiDungChiTiet,
        CLSYeuCau_Id,
        SoLuongChiDinh,
      } = res.data[0];

      const insertRes = await http.post(`/cls/insert`, {
        hangDoiId: selectedHangDoi?.FieldCode,
        benhNhanId: BenhNhan_Id,
        uuTien: UuTien,
        loaiPhieu: LoaiPhieu,
        noiDung: NoiDungChiTiet,
        clsYeuCauId: CLSYeuCau_Id,
        soLuongChiDinh: SoLuongChiDinh,
      });
      if (insertRes?.data && insertRes.data.length > 0) {
        message.success(`Đã thêm bệnh nhân vào hàng chờ`);
      } else {
        message.error("Thêm vào hàng chờ không thành công");
      }
    } catch (e) {
      message.error(e.message || "Có lỗi khi xử lý barcode");
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
    actions: {
      handleGoiBn,
      handleBoQua,
      handleGoiLai,
      handleInsertVP,
      refresh: fetchData,
    },
  };
};
