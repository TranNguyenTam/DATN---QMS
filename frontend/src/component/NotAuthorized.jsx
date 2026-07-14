import { Button, Result } from "antd";

const NotAuthorized = () => (
  <Result
    status="403"
    title="403"
    subTitle="Bạn không có quyền truy cập khu vực này."
    extra={<Button type="primary" href="/login">Đăng nhập lại</Button>}
  />
);
export default NotAuthorized;