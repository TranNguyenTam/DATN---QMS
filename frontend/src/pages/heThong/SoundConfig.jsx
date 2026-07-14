import { PlayCircleOutlined, SoundOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Descriptions, Input, Row, Tag, message } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../../component/PageHeader";

const API_URL =
  import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`;

/**
 * Cấu hình âm thanh — test Viettel TTS với text tùy chọn.
 *
 * Web QMS không cần process AmThanhTiepNhan.exe (WinForms) vì toàn bộ
 * TTS đã gọi Viettel API trực tiếp và phát qua browser audio queue
 * trong component VoiceQueuePlayer.
 */
export default function SoundConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [text, setText] = useState("Mời số 1 đến quầy tiếp nhận số 1");
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);

  const loadConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/tts/config`, {
        headers: { Authorization: `Bearer ${token || ""}` },
      });
      const data = await res.json();
      setConfig(data?.data || null);
    } catch (e) {
      message.error("Không tải được cấu hình TTS");
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const play = async () => {
    if (!text.trim()) return message.warning("Nhập text cần đọc");
    setPlaying(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/tts/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.data?.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 50);
    } catch (e) {
      message.error(e?.message || "Không phát được TTS");
    } finally {
      setPlaying(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<SoundOutlined />}
        title="Cấu hình âm thanh"
        subtitle="Cấu hình và phát thử giọng đọc Viettel TTS"
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Trước đây WinForms giám sát process AmThanhTiepNhan.exe để phát loa. Web QMS phát TTS trực tiếp trên trình duyệt qua Viettel AI."
      />

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="Cấu hình hiện tại" loading={loading}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Voice">
                {config?.voice ? <Tag color="blue">{config.voice}</Tag> : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Tốc độ (speed)">
                {config?.speed ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="URL Viettel">
                <code style={{ fontSize: 12 }}>{config?.url || "—"}</code>
              </Descriptions.Item>
              <Descriptions.Item label="Token">
                {config?.tokenConfigured ? (
                  <Tag color="green">Đã có token</Tag>
                ) : (
                  <Tag color="red">Chưa cấu hình</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 8, color: "#888", fontSize: 12 }}>
              Cấu hình thay đổi bằng cách sửa mục <code>TtsOptions</code> trong
              <code> appsettings.json</code> hoặc biến môi trường.
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Phát thử">
            <Input.TextArea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nội dung cần đọc"
            />
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              style={{ marginTop: 12 }}
              loading={playing}
              onClick={play}
            >
              Phát thử
            </Button>
            {audioUrl && (
              <div style={{ marginTop: 12 }}>
                <SoundOutlined /> <audio ref={audioRef} controls src={audioUrl} />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
