import {
    DisconnectOutlined,
    HomeOutlined,
    LogoutOutlined,
    SyncOutlined,
    UserOutlined,
    WifiOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Image, Layout, Tooltip, Typography } from "antd";
import { useEffect, useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { logout } from "../../store/slices/authSlice";

import AppMenu from "../../component/AppMenu";
import { useSocket } from "../../hooks/useSocket";
import "./MainLayout.scss";

const { Header, Content, Footer, Sider } = Layout;
const { Text } = Typography;

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const user = useSelector((state) => state.auth.user);

  const { isConnected, reconnect } = useSocket();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  console.log(user);

  useEffect(() => {
    if (user?.amThanh && location.pathname !== "/amthanh") {
      navigate("/amthanh", { replace: true });
    }
  }, [user, navigate, location.pathname]);

  const handleLogout = () => {
    if (window.confirm("Bạn muốn đăng xuất không?")) {
      dispatch(logout());
      navigate("/login", { replace: true });
    }
  };

  const getStatusColor = () => {
    if (isConnected) {
      return "#52c41a";
    } else {
      return "#ff4d4f";
    }
  };

  // Text hiển thị tooltip
  const getStatusText = () => {
    if (isConnected) {
      return "Hệ thống Online";
    } else {
      return "Mất kết nối máy chủ";
    }
  };

  return (
    <Layout className="main-layout">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={250}
      >
        <div className={`sidebar-logo ${collapsed ? "collapsed" : ""}`}>
          <Image src="/logoYHCT.png" alt="Logo" width={32} preview={false} />
          {!collapsed && (
            <span className="sidebar-logo__text">Y Học Cổ Truyền</span>
          )}
        </div>
        <AppMenu />
      </Sider>

      <Layout className="site-layout">
        <Header className="site-layout-header">
          <div className="header-title">
            <Text strong>HỆ THỐNG QMS</Text>
          </div>

          <div className="header-right">
            {/* Socket status */}
            <Tooltip title={getStatusText()}>
              <div
                className={`socket-status ${isConnected ? "online" : "offline"}`}
              >
                {isConnected ? (
                  <WifiOutlined className="status-icon" />
                ) : (
                  <DisconnectOutlined className="status-icon" />
                )}
                <span className="status-label">
                  {isConnected ? "Online" : "Offline"}
                </span>
              </div>
            </Tooltip>

            {!isConnected && (
              <Button
                type="primary"
                size="small"
                danger
                icon={<SyncOutlined spin />}
                onClick={reconnect}
                className="reconnect-btn"
              >
                Kết nối lại
              </Button>
            )}

            {/* Divider */}
            <div className="header-divider" />

            {/* User info */}
            {user && (
              <div className="user-info">
                <Avatar
                  className="user-avatar"
                  icon={<UserOutlined />}
                  size={32}
                />
                <div className="user-details">
                  <span className="user-name">{user.userName}</span>
                  {user.departmentName && (
                    <span className="user-dept">
                      <HomeOutlined style={{ fontSize: 10 }} />{" "}
                      {user.departmentName}
                    </span>
                  )}
                </div>
              </div>
            )}

            <Button
              type="text"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              className="logout-btn-1"
            >
              Thoát
            </Button>
          </div>
        </Header>

        <Content
          style={{
            margin: "0 16px",
            // Cho phép content scroll trong khung viewport thay vì document
            // body scroll — Sider sticky không bị "tụt" khi nội dung dài.
            height: "calc(100vh - 64px)", // 64px = Header height
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <div className="site-layout-content">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
