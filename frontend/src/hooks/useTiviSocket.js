import { useEffect } from "react";
import { useSocket } from "./useSocket";

export const useTiviSocket = ({ info, fetchData, EVENTS_NEED_REFRESH }) => {
  const { isConnected, sendMessage, subscribe, unsubscribe } = useSocket();

  const normalizeId = (value) => {
    if (value == null) return null;
    const asNumber = Number(value);
    return Number.isNaN(asNumber) ? String(value) : asNumber;
  };

  // Register device
  useEffect(() => {
    if (!isConnected || !info) return;

    const deviceName =
      info?.Devices?.TenTivi?.trim() || info?.Devices?.UserCode?.trim();
    if (!deviceName) return;

    sendMessage("/app/device/register", {
      deviceName,
      deviceType: "TV",
    });
  }, [isConnected, sendMessage, info]);

  // Subscribe socket messages
  useEffect(() => {
    if (!isConnected) return;
    const callback = (data) => {
      const eventHangDoiId = normalizeId(data?.hangDoiId);
      const eventPhongBanId = normalizeId(data?.phongBanId);
      const currentHangDoiId = normalizeId(info?.HangDoi?.FieldCode);
      const currentPhongBanId = normalizeId(info?.PhongBan?.FieldCode);

      const hangDoiMatch =
        eventHangDoiId != null && eventHangDoiId === currentHangDoiId;
      const phongBanMatch =
        eventPhongBanId != null && eventPhongBanId === currentPhongBanId;

      if (
        EVENTS_NEED_REFRESH?.has(data?.event) &&
        (hangDoiMatch || phongBanMatch)
      ) {
        fetchData(info);
      }
    };

    const __sub = subscribe("/topic/messages", callback);

    return () => {
      __sub?.unsubscribe();
    };
  }, [
    isConnected,
    subscribe,
    unsubscribe,
    fetchData,
    info,
    EVENTS_NEED_REFRESH,
  ]);
};
