// --- FIXED APP.JSX ---
import { Spin } from "antd";
import { lazy, Suspense, useEffect } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.scss";
import { store } from "./store";

import ErrorBoundary from "./component/ErrorBoundary";
import NotAuthorized from "./component/NotAuthorized";
import NotFound from "./component/NotFound";
import FullScreenLayout from "./layouts/FullScreenLayout";
import MainLayout from "./layouts/MainLayout";
import Login from "./pages/Login";
import Loa from "./pages/amthanh/Loa";

import { ALL_MENU_ITEMS } from "./config/menuConfig";

// PWA — trang public theo dõi STT cho BN (không cần đăng nhập)
const TrackBenhNhan = lazy(() => import("./pages/public/TrackBenhNhan"));
import {
    loadSession,
    selectIsCheckingSession,
    selectUser,
} from "./store/slices/authSlice";

const getPermissionKey = (item) => item?.permissionKey || item?.key;

// ================== PROTECTED ROUTE =====================
const ProtectedRoute = ({ children, requiredPermissionKey }) => {
  const user = useSelector(selectUser);

  if (!user) return <Navigate to="/login" replace />;

  if (requiredPermissionKey) {
    const ok =
      user.userCode === "ADMIN" ||
      user.permissions?.includes(requiredPermissionKey);
    if (!ok) return <NotAuthorized />;
  }

  return children;
};

// ================== REDIRECT TO FIRST MENU ==================
const RedirectToFirst = () => {
  const user = useSelector(selectUser);

  if (!user) return <Navigate to="/login" replace />;

  const findFirstPath = (items) => {
    for (const item of items) {
      const hasPerm =
        user.userCode === "ADMIN" ||
        user.permissions?.includes(getPermissionKey(item));

      if (hasPerm) {
        if (item.path) return item.path;
        if (item.children) {
          const childPath = findFirstPath(item.children);
          if (childPath) return childPath;
        }
      }
    }
    return null;
  };

  const firstPath = findFirstPath(ALL_MENU_ITEMS);

  if (firstPath) {
    return <Navigate to={firstPath} replace />;
  }

  return <h2>Không có quyền truy cập menu nào.</h2>;
};

// ===================== APP CONTENT ======================
const AppContent = () => {
  const dispatch = useDispatch();
  const isCheckingSession = useSelector(selectIsCheckingSession);

  useEffect(() => {
    dispatch(loadSession());
  }, []);

  if (isCheckingSession) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
        }}
      >
        <Spin size="large" tip="Dang tai phien dang nhap..." />
      </div>
    );
  }

  // -----------------------------------------------------
  // Tự động sinh route từ menu
  // -----------------------------------------------------
  const renderMenuRoutes = (items) => {
    let routes = [];

    items.forEach((item) => {
      if (item.path && item.component) {
        const Element = item.component;
        const permissionKey = getPermissionKey(item);
        const fullPath = item.path.startsWith("/")
          ? item.path
          : "/" + item.path;

        const isFullScreen =
          fullPath.startsWith("/kiosk") || fullPath.startsWith("/tivi");

        routes.push(
          <Route
            key={item.key}
            path={fullPath}
            element={
              <ProtectedRoute requiredPermissionKey={permissionKey}>
                {isFullScreen ? <FullScreenLayout /> : <MainLayout />}
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={null}>
                  <Element />
                </Suspense>
              }
            />
          </Route>,
        );
      }

      if (item.children)
        routes = routes.concat(renderMenuRoutes(item.children));
    });

    return routes;
  };

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          {/* LOGIN */}
          <Route path="/login" element={<Login />} />

          {/* PWA — public, không cần JWT */}
          <Route path="/track" element={<TrackBenhNhan />} />
          <Route
            path="/track/:hangDoiId/:stt"
            element={<TrackBenhNhan />}
          />

          {/* Trang chủ "/" */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<RedirectToFirst />} />
          </Route>

          <Route path="/amthanh" element={<MainLayout />}>
            <Route index element={<Loa />} />
          </Route>

          {/* Từ menu sinh ra */}
          {renderMenuRoutes(ALL_MENU_ITEMS)}

          {/* Không khớp → NotFound */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

// ===================== EXPORT ======================
const App = () => (
  <Provider store={store}>
    <AppContent />
  </Provider>
);

export default App;
