import { ReloadOutlined, WarningFilled } from "@ant-design/icons";
import { Button, Result, Typography } from "antd";
import { Component } from "react";

const { Paragraph, Text } = Typography;

/**
 * Bắt mọi lỗi React render trong cây con — thay vì trang trắng.
 * Bọc quanh Routes ở App.jsx.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null, info: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Result
          status="error"
          icon={<WarningFilled style={{ color: "#ff4d4f" }} />}
          title="Đã có lỗi xảy ra"
          subTitle="Trang gặp sự cố. Bạn có thể thử tải lại hoặc quay về màn hình chính."
          extra={[
            <Button
              key="reload"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={this.reset}
            >
              Tải lại
            </Button>,
            <Button
              key="home"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Về trang chủ
            </Button>,
          ]}
        >
          <div style={{ textAlign: "left", maxWidth: 720 }}>
            <Paragraph>
              <Text strong>Chi tiết lỗi (báo cho IT):</Text>
            </Paragraph>
            <Paragraph>
              <pre
                style={{
                  background: "#f8fafc",
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  overflowX: "auto",
                  maxHeight: 200,
                }}
              >
                {String(this.state.error?.message || this.state.error)}
                {this.state.info?.componentStack && (
                  <>
                    {"\n\n"}
                    {this.state.info.componentStack.trim()}
                  </>
                )}
              </pre>
            </Paragraph>
          </div>
        </Result>
      </div>
    );
  }
}
