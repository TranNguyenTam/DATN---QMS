import { DesktopOutlined, SoundOutlined } from "@ant-design/icons";
import { Badge, Card, Empty } from "antd";
import { useEffect, useState } from "react";
import { useSocket } from "../../hooks/useSocket";
import "./DeviceCard.scss";

const normalizeDevice = (d) => ({
  deviceName: d?.deviceName ?? d?.DeviceName ?? "",
  deviceType: d?.deviceType ?? d?.DeviceType ?? "",
  status: d?.status ?? d?.Status ?? "DISCONNECT",
});

const DeviceCard = (props) => {
  const { isConnected, subscribe, unsubscribe } = useSocket();
  const [devices, setDevices] = useState(props.initDevices || []);

  useEffect(() => {
    setDevices(props.initDevices || []);
  }, [props.initDevices]);

  useEffect(() => {
    if (!isConnected) return;

    const __sub = subscribe("/topic/device-status", (data) => {
      if (!Array.isArray(data)) return;

      setDevices((prev) => {
        const connectedList = data
          .map((d) => normalizeDevice(d))
          .map((d) => ({ ...d, status: "CONNECTED" }));

        const seed = (
          props.initDevices && props.initDevices.length > 0
            ? props.initDevices
            : prev || []
        ).map((d) => normalizeDevice(d));

        // User chưa gán màn hình/Tivi (seed rỗng) → CHỈ hiện placeholder
        // "Chưa kết nối". KHÔNG đổ toàn bộ session online (ADMIN/THU001/
        // DUOC001 cùng mở tab) vào — đó là các user khác, không phải
        // thiết bị của phòng này.
        if (seed.length === 0) {
          return [{ deviceName: "", deviceType: "TV", status: "DISCONNECT" }];
        }

        const connectedByName = new Map(
          connectedList
            .filter((d) => Boolean(d.deviceName))
            .map((d) => [d.deviceName, d]),
        );
        const usedConnectedNames = new Set();

        const merged = seed.map((device) => {
          let connected = null;

          if (device.deviceName) {
            connected = connectedByName.get(device.deviceName) || null;
          }

          if (!connected && device.deviceType) {
            connected =
              connectedList.find(
                (d) =>
                  d.deviceType === device.deviceType &&
                  !usedConnectedNames.has(d.deviceName || ""),
              ) || null;
          }

          if (connected?.deviceName) {
            usedConnectedNames.add(connected.deviceName);
          }

          return connected
            ? { ...device, ...connected, status: "CONNECTED" }
            : { ...device, status: "DISCONNECT" };
        });

        // KHÔNG append connectedList chưa khớp seed — nếu không, mọi
        // session online (user khác) sẽ bị đẩy vào card. Chỉ hiển thị
        // đúng thiết bị đã gán cho user/phòng này (= seed).
        return merged;
      });
    });

    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, props.initDevices]);

  const renderIcon = (type) => {
    if (type === "TV") return <DesktopOutlined />;
    if (type === "SPEAKER") return <SoundOutlined />;
    return <DesktopOutlined />;
  };

  const getTypeLabel = (type) => {
    if (type === "TV") return "Màn hình";
    if (type === "SPEAKER") return "Loa";
    return type;
  };

  return (
    <Card
      title={
        <span className="device-card-title">
          <DesktopOutlined style={{ color: "#1677ff", marginRight: 6 }} />
          Thiết bị kết nối
        </span>
      }
      size="small"
      className="device-card-wrapper"
    >
      <div className="device-list">
        {devices.length === 0 ? (
          <Empty
            description="Chưa có thiết bị"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          devices.map((item) => {
            const d = normalizeDevice(item);
            return (
              <div
                key={`${d.deviceName || "unknown"}-${d.deviceType}`}
                className={`device-item ${d.status === "CONNECTED" ? "connected" : "disconnected"}`}
              >
                <div className="device-left">
                  <div
                    className={`device-icon-wrap ${d.status === "CONNECTED" ? "active" : ""}`}
                  >
                    {renderIcon(d.deviceType)}
                  </div>
                  <div className="device-info">
                    <span className="device-name">
                      {d.deviceName || "Chưa kết nối"}
                    </span>
                    <span className="device-type">
                      {getTypeLabel(d.deviceType)}
                    </span>
                  </div>
                </div>
                <Badge
                  status={d.status === "CONNECTED" ? "success" : "error"}
                  text={d.status === "CONNECTED" ? "Online" : "Offline"}
                  className="device-badge"
                />
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};

export default DeviceCard;
