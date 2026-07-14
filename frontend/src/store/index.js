import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    // Sau này có thể thêm:
    // queue: queueReducer, (Quản lý hàng đợi real-time)
    // socket: socketReducer, (Quản lý kết nối WebSocket)
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Tắt check serializable nếu lưu object Date hoặc non-serializable data
    }),
});