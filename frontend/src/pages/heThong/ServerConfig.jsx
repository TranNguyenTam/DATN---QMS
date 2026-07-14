import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudServerOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Alert, Card, Col, Descriptions, Row, Spin, Tag } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import PageHeader from "../../component/PageHeader";
import { SocketContext } from "../../contexts/SocketContext";
import http from "../../util/httpClient";

/**
 * Monitor các service phụ trợ: SignalR hub, Face AI, Viettel TTS, DB qua /dashboard/summary.
 * Thay thế cho form `HeThong/Server.cs` + `CheckOpenAmThanh.cs` của WinForms
 * (không còn dùng TCP socket 27000 + AmThanhTiepNhan.exe).
 */
export default function ServerConfig() {
  const socket = useContext(SocketContext);
  const [faceHealth, setFaceHealth] = useState({ status: "loading" });
  const [ttsConfig, setTtsConfig] = useState(null);
  const [dbPing, setDbPing] = useState({ status: "loading" });
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setFaceHealth({ status: "loading" });
    setDbPing({ status: "loading" });
    try {
      const [faceRes, ttsRes, sumRes] = await Promise.allSettled([
        http.get("/face/health"),
        http.get("/tts/config"),
        http.get("/dashboard/summary"),
      ]);

      if (faceRes.status === "fulfilled") {
        const d = faceRes.value?.data;
        setFaceHealth({
          status: d?.available ? "ok" : "down",
          message: d?.message || "Không phản hồi",
        });
      } else {
        setFaceHealth({ status: "down", message: faceRes.reason?.message || "Không kết nối được" });
      }

      if (ttsRes.status === "fulfilled") setTtsConfig(ttsRes.value?.data || null);
      else setTtsConfig(null);

      if (sumRes.status === "fulfilled") setDbPing({ status: "ok", message: "SQL Server OK" });
      else setDbPing({ status: "down", message: "Không kết nối được DB" });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [check]);

  const StatusTag = ({ status, loadingText = "Đang kiểm tra..." }) => {
    if (status === "loading") return <Tag icon={<Spin size="small" />}>{loadingText}</Tag>;
    if (status === "ok")
      return <Tag icon={<CheckCircleFilled />} color="green">Online</Tag>;
    return <Tag icon={<CloseCircleFilled />} color="red">Offline</Tag>;
  };

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<CloudServerOutlined />}
        title="Cấu hình máy chủ"
        subtitle="Giám sát trạng thái SignalR hub, SQL Server, AI khuôn mặt và Viettel TTS"
        extra={
          <PageHeader.Button
            icon={<ReloadOutlined />}
            onClick={check}
            loading={checking}
          >
            Kiểm tra lại
          </PageHeader.Button>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Web QMS thay thế server TCP (port 27000) của WinForms bằng SignalR hub trực tiếp trên backend. Màn này giám sát các dịch vụ phụ và trạng thái kết nối realtime."
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Realtime hub (SignalR)">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Kết nối">
                {socket?.isConnected ? (
                  <Tag icon={<CheckCircleFilled />} color="green">Đã kết nối</Tag>
                ) : (
                  <Tag icon={<CloseCircleFilled />} color="orange">Đang kết nối...</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="URL">{window.location.origin}/ws</Descriptions.Item>
              <Descriptions.Item label="Mô tả">
                Đẩy sự kiện phát số, gọi số, bỏ qua đến Tivi và máy thao tác.
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="SQL Server">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Trạng thái">
                <StatusTag status={dbPing.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{dbPing.message || "—"}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="AI nhận diện khuôn mặt">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Trạng thái">
                <StatusTag status={faceHealth.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{faceHealth.message || "—"}</Descriptions.Item>
              <Descriptions.Item label="URL nội bộ">http://ai-face:5010</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Viettel TTS">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Voice">
                {ttsConfig?.voice ? <Tag color="blue">{ttsConfig.voice}</Tag> : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Speed">{ttsConfig?.speed ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Token config">
                {ttsConfig?.tokenConfigured ? (
                  <Tag color="green">Đã có token</Tag>
                ) : (
                  <Tag color="red">Thiếu token</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
