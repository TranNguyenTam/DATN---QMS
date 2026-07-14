import {
    LockOutlined,
    MedicineBoxOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../store/slices/authSlice";
import "./Login.scss";

const { Title, Text } = Typography;

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    try {
      setLoading(true);
      await dispatch(loginUser(values)).unwrap();
      message.success("Đăng nhập thành công!");
      navigate("/");
    } catch (error) {
      message.error(error || "Sai tài khoản hoặc mật khẩu!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background decorative circles */}
      <div className="bg-circle bg-circle--1" />
      <div className="bg-circle bg-circle--2" />
      <div className="bg-circle bg-circle--3" />

      <div className="login-container">
        {/* Left panel - branding */}
        <div className="login-brand">
          <div className="brand-logo">
            <MedicineBoxOutlined />
          </div>
          <h1 className="brand-title">Y Học Cổ Truyền</h1>
          <p className="brand-subtitle">Hệ thống quản lý hàng đợi thông minh</p>
          <div className="brand-features">
            <div className="feature-item">
              <span className="feature-dot" /> Gọi số tự động
            </div>
            <div className="feature-item">
              <span className="feature-dot" /> Theo dõi thời gian thực
            </div>
            <div className="feature-item">
              <span className="feature-dot" /> Báo cáo thống kê
            </div>
          </div>
        </div>

        {/* Right panel - form */}
        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="form-header">
              <Title level={3} className="form-title">
                Đăng nhập
              </Title>
              <Text type="secondary" className="form-subtitle">
                Vui lòng nhập thông tin tài khoản của bạn
              </Text>
            </div>

            <Form
              name="login_form"
              onFinish={onFinish}
              size="large"
              layout="vertical"
            >
              <Form.Item
                name="username"
                label="Tài khoản"
                rules={[
                  { required: true, message: "Vui lòng nhập tài khoản!" },
                ]}
              >
                <Input
                  prefix={<UserOutlined className="input-icon" />}
                  placeholder="Nhập tài khoản..."
                  autoComplete="username"
                />
              </Form.Item>

              <Form.Item
                name="password"
                label="Mật khẩu"
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
              >
                <Input.Password
                  prefix={<LockOutlined className="input-icon" />}
                  placeholder="Nhập mật khẩu..."
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  loading={loading}
                  className="login-btn"
                >
                  {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                </Button>
              </Form.Item>
            </Form>

            <div className="form-footer">
              <Text type="secondary" style={{ fontSize: 12 }}>
                © 2025 QMS Hospital System
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
