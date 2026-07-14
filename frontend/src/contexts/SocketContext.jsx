// SocketContext.jsx
import React, { createContext, useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";

export const SocketContext = createContext(null);

// Port 5000 is default for C# .NET Core MVC
// Dùng URL đầy đủ để SignalR negotiate qua HTTP rồi upgrade lên WebSocket
// Khi dev: Vite proxy /ws → localhost:5000/ws
// Khi deploy: set VITE_WS_URL=https://your-domain/ws
const _wsOrigin = import.meta.env.VITE_WS_URL
  ? import.meta.env.VITE_WS_URL
  : `${window.location.protocol}//${window.location.host}`;
const SOCKET_URL = `${_wsOrigin}/ws`;

export const SocketProvider = ({ children }) => {
  const connectionRef = useRef(null);
  // Mỗi topic giữ MỘT DANH SÁCH listener (trước đây chỉ 1 slot → hai màn hình
  // cùng topic ghi đè callback của nhau, và cleanup của màn này xóa nhầm
  // subscription của màn kia). Mỗi listener có id riêng để gỡ đúng cái của mình.
  const subscriptionsRef = useRef({});
  const subIdRef = useRef(0);

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    console.info("[Socket] Initializing SignalR", { url: SOCKET_URL });
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(SOCKET_URL)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    connection.onreconnecting((error) => {
      console.warn("[Socket] Reconnecting...", error);
      setIsConnected(false);
    });

    connection.onreconnected((connectionId) => {
      console.info("[Socket] Reconnected!", connectionId);
      setIsConnected(true);
    });

    connection.onclose((error) => {
      console.warn("[Socket] Closed", error);
      setIsConnected(false);
    });

    // Phát payload tới TẤT CẢ listener đang đăng ký topic tương ứng.
    // Map method SignalR → topic STOMP-style.
    const emit = (topic, payload) => {
      const list = subscriptionsRef.current[topic];
      if (!list || list.length === 0) return;
      // Copy mảng để một listener tự unsubscribe trong callback không phá vòng lặp.
      [...list].forEach((entry) => {
        try {
          entry.callback(payload); // SignalR auto-deserializes JSON
        } catch (err) {
          console.error("[Socket] listener error", topic, err);
        }
      });
    };

    connection.on("ReceiveMessage", (payload) =>
      emit("/topic/messages", payload),
    );
    connection.on("DeviceStatus", (payload) =>
      emit("/topic/device-status", payload),
    );
    connection.on("OverloadAlert", (payload) =>
      emit("/topic/overload-alert", payload),
    );

    const startConnection = async () => {
      try {
        await connection.start();
        console.info("[Socket] Connected");
        setIsConnected(true);
      } catch (err) {
        console.error("[Socket] Start error", err);
      }
    };

    startConnection();
    connectionRef.current = connection;

    return () => {
      connection.stop();
    };
  }, []);

  // 🔹 SUBSCRIBE — thêm 1 listener cho topic, trả về handle để gỡ ĐÚNG listener đó.
  const subscribe = (topic, callback) => {
    if (
      !connectionRef.current ||
      connectionRef.current.state !== signalR.HubConnectionState.Connected
    )
      return null;

    const id = ++subIdRef.current;
    const list =
      subscriptionsRef.current[topic] ||
      (subscriptionsRef.current[topic] = []);
    list.push({ id, callback });

    return {
      unsubscribe: () => {
        const arr = subscriptionsRef.current[topic];
        if (!arr) return;
        const idx = arr.findIndex((e) => e.id === id);
        if (idx !== -1) arr.splice(idx, 1);
        if (arr.length === 0) delete subscriptionsRef.current[topic];
      },
    };
  };

  //  UNSUBSCRIBE (legacy) — gỡ TẤT CẢ listener của topic. Khuyến nghị dùng
  //  handle.unsubscribe() trả về từ subscribe() để chỉ gỡ đúng listener của mình.
  const unsubscribe = (topic) => {
    delete subscriptionsRef.current[topic];
  };

  // SEND
  const sendMessage = (destination, payload) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      // Typically SignalR handles client->server via strongly-typed method names
      // Emulating STOMP destination:
      connectionRef.current
        .invoke("SendMessage", payload)
        .catch((err) => console.error(err));
    }
  };

  // RECONNECT
  const reconnect = () => {
    if (!connectionRef.current) return;

    console.log("[Socket] Force reconnect");

    subscriptionsRef.current = {};

    connectionRef.current.stop().then(() => {
      connectionRef.current.start();
    });
  };

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        subscribe,
        unsubscribe,
        sendMessage,
        reconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
