import { message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { EVENTS_NEED_REFRESH } from "../const/const";
import http from "../util/httpClient";
import { useSocket } from "./useSocket";
import { useVoiceAnnouncement } from "./useVoiceAnnouncement";

export const useQueueLogicTN = () => {
  const [hangDoi, setHangDoi] = useState([]);
  const [quay, setQuay] = useState([]);
  const [selectedHangDoi, setSelectedHangDoi] = useState(null);
  const [selectedQuay, setSelectedQuay] = useState(null);

  const [dsHangCho, setDsHangCho] = useState([]);
  const [benhNhanMoi, setBenhNhanMoi] = useState(null);
  const [initDevices, setInitDevices] = useState([]);
  const [loadingInit, setLoadingInit] = useState(false);
  const [loading, setLoading] = useState(false);
  const { announce } = useVoiceAnnouncement();

  // 1. Init Data
  useEffect(() => {
    const initData = async () => {
      try {
        setLoadingInit(true);
        const [hangdoiRes, quayRes, deviceRes] = await Promise.all([
          http.get("/tiep-nhan/hang-doi"),
          http.get("/tiep-nhan/quay"),
          http.get("/common/device"),
        ]);
        const listHangDoi = hangdoiRes?.data || [];
        const listQuay = quayRes?.data || [];
        if (deviceRes?.data) setInitDevices(deviceRes.data);
        setHangDoi(listHangDoi);
        setQuay(listQuay);
        if (listHangDoi.length > 0)
          setSelectedHangDoi(listHangDoi[0].FieldCode);
        if (listQuay.length > 0) setSelectedQuay(listQuay[0].FieldCode);
      } catch (error) {
        message.error("Lỗi khởi tạo: " + error.message);
      } finally {
        setLoadingInit(false);
      }
    };
    initData();
  }, []);

  // 2. Fetch Data Core
  const fetchData = useCallback(async () => {
    if (!selectedHangDoi) return;
    try {
      const listRes = await http.get(
        `/tiep-nhan/hang-doi/${selectedHangDoi}/danhsach`,
      );
      const dsList = listRes?.data || [];
      setDsHangCho([...dsList].reverse());

      if (selectedQuay) {
        const params = { hangdoi_id: selectedHangDoi, quay_id: selectedQuay };
        const moiBnRes = await http.get(`/tiep-nhan/moi-bn`, params);
        const dataMoiBn = moiBnRes?.data || [];
        if (dataMoiBn.length > 0) {
          const stt = dataMoiBn[0].STT;
          // Match về dsList để lấy HangDoiPhongBan_Id của BN đang gọi (phục vụ chuyển hàng đợi).
          const matched = dsList.find(
            (r) => String(r.STTdb || r.STT) === String(stt),
          );
          const tenBnRes = await http.get(`/tiep-nhan/benh-nhan`, {
            stt: stt,
            hangdoi_id: selectedHangDoi,
          });
          const dataTenBn = tenBnRes?.data || [];
          setBenhNhanMoi({
            STT: stt,
            TenBenhNhan: dataTenBn[0]?.TenBenhNhan || "N/A",
            HangDoiPhongBan_Id: matched?.HangDoiPhongBan_Id ?? null,
            STTdb: matched?.STTdb ?? stt,
          });
        } else {
          setBenhNhanMoi(null);
        }
      }
    } catch (error) {
      console.error("Lỗi tải dữ liệu:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedHangDoi, selectedQuay]);

  useEffect(() => {
    if (selectedHangDoi && selectedQuay) {
      fetchData();
    }
  }, [selectedHangDoi, selectedQuay, fetchData]);

  //socket
  const { isConnected, subscribe, unsubscribe } = useSocket();
  useEffect(() => {
    if (!isConnected) return;

    const __sub = subscribe("/topic/messages", (data) => {
      console.log("messagesocket", data);
      if (
        EVENTS_NEED_REFRESH.has(data?.event) &&
        data?.hangDoiId === selectedHangDoi
      ) {
        fetchData();
      }
    });
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, fetchData, selectedHangDoi]);
  //end socket

  const handleGoiBn = async () => {
    if (!selectedQuay || !selectedHangDoi)
      return message.warning("Vui lòng chọn Quầy và Hàng đợi");
    if (dsHangCho.length === 0) {
      return message.warning("Hết bệnh nhân trong hàng đợi!");
    }
    try {
      const res = await http.post("/tiep-nhan/goi-moi", {
        phongBanId: selectedQuay,
        hangDoiId: selectedHangDoi,
      });
      if (res && res.data.length > 0) {
        const bn = res.data[0];
        message.success(`Đang gọi: ${bn.STT}`);

        const q = quay.find((k) => k.FieldCode === selectedQuay);
        const tenQuay = q?.FieldName || "Quầy tiếp nhận";
        announce(`Mời số thứ tự ${bn.STT}, đến ${tenQuay}.`);
      } else {
        message.warning("Hết bệnh nhân trong hàng đợi!");
      }
    } catch (error) {
      message.error(error.message || "Lỗi khi gọi bệnh nhân!");
    }
  };

  const handleBoQua = async (record) => {
    try {
      const res = await http.put(
        "/tiep-nhan/bo-qua/" + record.HangDoiPhongBan_Id,
        {
          phongBanId: selectedQuay,
          hangDoiId: selectedHangDoi,
        },
      );
      console.log(res);

      if (res.data && res.data.length > 0) {
        message.success(`Đã bỏ qua: ${record.STTdb}`);
      } else {
        message.error("Không thể bỏ qua bệnh nhân.");
      }
    } catch (error) {
      message.error(error.message || "Lỗi thao tác.");
    }
  };

  const handleGoiLai = async (record) => {
    try {
      const reqBody = {
        phongBanId: selectedQuay,
        hangDoiId: selectedHangDoi,
      };
      const selectedId = record?.HangDoiPhongBan_Id;
      const endpoint = selectedId
        ? `/tiep-nhan/goi-lai/${selectedId}`
        : "/tiep-nhan/goi-lai";

      const res = await http.post(endpoint, reqBody);
      if (res?.data?.length > 0) {
        const recalledStt =
          record?.STTdb || record?.STT || res?.data?.[0]?.STT || "---";
        message.success(`Đã gọi lại: ${recalledStt}`);

        const q = quay.find((k) => k.FieldCode === selectedQuay);
        const tenQuay = q?.FieldName || "Quầy tiếp nhận";
        announce(`Mời số thứ tự ${recalledStt}, đến ${tenQuay}.`);
      } else {
        message.warning("Không thể gọi lại.");
      }
    } catch (error) {
      message.error(error.message || "Không thể gọi lại.");
    }
  };

  const handleHuy = async (record) => {
    try {
      const res = await http.del("/tiep-nhan/" + record.HangDoiPhongBan_Id);
      if (res.data && res.data.length > 0) {
        message.success(`Đã xoá: ${record.STTdb}`);
      } else {
        message.error("Không thể xoá bệnh nhân.");
      }
    } catch (error) {
      message.error(error.message || "Lỗi khi xoá.");
    }
  };

  return {
    hangDoi,
    quay,
    selectedHangDoi,
    selectedQuay,
    dsHangCho,
    benhNhanMoi,
    initDevices,
    loading,
    loadingInit,
    actions: {
      setSelectedQuay,
      setSelectedHangDoi,
      handleGoiBn,
      handleBoQua,
      handleGoiLai,
      handleHuy,
      refresh: fetchData,
    },
  };
};
