import { LockOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, message } from "antd";
import { useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

/**
 * Đổi mật khẩu — gọi POST /api/v1/auth/change-password.
 * Backend xác thực mật khẩu hiện tại qua SP_001_Users Action=CheckChangePassword,
 * cập nhật qua Action=ChangePassword.
 */
export default function ChangePassword() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.newPassword === values.oldPassword) {
        message.warning("Mật khẩu mới phải khác mật khẩu cũ");
        return;
      }
      setLoading(true);
      const res = await http.post("/auth/change-password", {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      if (res?.data?.ok) {
        message.success(res.data.message || "Đổi mật khẩu thành công");
        form.resetFields();
      } else {
        message.error(res?.data?.message || "Đổi mật khẩu thất bại");
      }
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.data?.message || e?.message || "Lỗi đổi mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <PageHeader
        icon={<LockOutlined />}
        title="Đổi mật khẩu"
        subtitle="Cập nhật mật khẩu đăng nhập cho tài khoản hiện tại"
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Mật khẩu được mã hóa trước khi lưu vào cơ sở dữ liệu. Sau khi đổi, phiên hiện tại vẫn dùng được đến khi đăng xuất."
      />
      <Card>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={handleSubmit}
        >
          <Form.Item
            name="oldPassword"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại" }]}
          >
            <Input.Password placeholder="Mật khẩu hiện tại" autoComplete="current-password" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới" },
              { min: 4, message: "Mật khẩu mới tối thiểu 4 ký tự" },
            ]}
          >
            <Input.Password placeholder="Mật khẩu mới" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Xác nhận mật khẩu mới"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "Vui lòng xác nhận mật khẩu mới" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                  return Promise.reject(new Error("Xác nhận mật khẩu không trùng khớp"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" />
          </Form.Item>

          <div style={{ display: "flex", gap: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading}>
              Xác nhận
            </Button>
            <Button htmlType="button" onClick={() => form.resetFields()}>
              Hủy
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
