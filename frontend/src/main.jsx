import "antd/dist/reset.css";
import "./styles/tokens.scss";
import "./styles/global.scss";
// import 'normalize.css';
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./App.jsx";
import { antdTheme } from "./config/antdTheme.js";
import { SocketProvider } from "./contexts/SocketContext.jsx";
import { store } from "./store/index.js";
createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <ConfigProvider theme={antdTheme} locale={viVN}>
      <SocketProvider>
        <App />
      </SocketProvider>
    </ConfigProvider>
  </Provider>,
);
