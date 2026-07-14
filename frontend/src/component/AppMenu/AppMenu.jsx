import React, { useMemo, useCallback, useState } from "react";
import { Menu } from "antd";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  SettingOutlined,
  UserAddOutlined,
  UnorderedListOutlined,
  UserOutlined,
  ExperimentOutlined,
  CameraOutlined,
  DollarOutlined,
  ShopOutlined,
  AppstoreOutlined,
  DashboardOutlined,
} from "@ant-design/icons";

import { selectUser } from "../../store/slices/authSlice";
import { ALL_MENU_ITEMS } from "../../config/menuConfig";
import "./AppMenu.scss";

const iconMap = {
  SettingOutlined: <SettingOutlined />,
  UserAddOutlined: <UserAddOutlined />,
  UnorderedListOutlined: <UnorderedListOutlined />,
  UserOutlined: <UserOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  CameraOutlined: <CameraOutlined />,
  DollarOutlined: <DollarOutlined />,
  ShopOutlined: <ShopOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  DashboardOutlined: <DashboardOutlined />,
};

const findPath = (items, key) => {
  for (let item of items) {
    if (item.key === key) return item.path;
    if (item.children) {
      const p = findPath(item.children, key);
      if (p) return p;
    }
  }
};

const getPermissionKey = (item) => item?.permissionKey || item?.key;

const AppMenu = (props) => {
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const [openKeys, setOpenKeys] = useState([]);

  const hasPermission = useCallback(
    (menuCode) => {
      if (!user) return false;
      if (user.userCode === "ADMIN") return true;
      return user.permissions?.includes(menuCode);
    },
    [user]
  );

  const menuItems = useMemo(() => {
    if (!user) return [];

    const filterMenu = (items) => {
      return items.reduce((acc, item) => {
        if (!hasPermission(getPermissionKey(item))) return acc;

        const newItem = {
          key: item.key,
          label: item.label,
          icon: iconMap[item.icon] || <AppstoreOutlined />,
        };

        if (item.children) {
          const visibleChildren = filterMenu(item.children);
          if (visibleChildren.length > 0) {
            newItem.children = visibleChildren;
            acc.push(newItem);
          }
        } else {
          acc.push(newItem);
        }
        return acc;
      }, []);
    };

    return filterMenu(ALL_MENU_ITEMS);
  }, [user, hasPermission]);

  const rootSubmenuKeys = useMemo(() => menuItems.map((item) => item.key), [menuItems]);

  const onOpenChange = useCallback((keys) => {
    const latestOpenKey = keys.find((key) => openKeys.indexOf(key) === -1);
    if (rootSubmenuKeys.indexOf(latestOpenKey) === -1) {
      setOpenKeys(keys);
    } else {
      setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
    }
  }, [openKeys, rootSubmenuKeys]);

  const handleMenuClick = useCallback((e) => {
    const path = findPath(ALL_MENU_ITEMS, e.key);
    if (path.startsWith("/tivi") || path.startsWith("/kiosk")) {
      window.open(window.location.origin + path, "_blank");
      return; // không điều hướng tab hiện tại
    }
    navigate(path);
  }, [navigate]);

  return (
    <div className="app-menu-container">
      <Menu
        theme="dark"
        defaultSelectedKeys={["1"]}
        mode="inline"
        openKeys={openKeys}
        onOpenChange={onOpenChange}
        {...props}
        items={menuItems}
        onClick={handleMenuClick}
        className="app-menu"
      />
    </div>
  );
};

export default React.memo(AppMenu);
