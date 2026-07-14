import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import http from '../../util/httpClient';

const initialState = {
  user: null,
  isAuthenticated: false,
  loading: false, 
  isCheckingSession: true,
  error: null
};

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const res = await http.post("/auth/login", credentials);
      if (!res || !res.data) return rejectWithValue("Sai tài khoản hoặc mật khẩu");
      const token = res.data.token ?? res.data.Token;
      const refreshToken = res.data.refreshToken ?? res.data.RefreshToken;
      if (token) localStorage.setItem("token", token);
      if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
      return res.data;
    } catch (error) {
      console.log(error);
      return rejectWithValue(error.message || "Lỗi đăng nhập");
    }
  }
);

export const loadSession = createAsyncThunk(
  "auth/loadSession",
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return rejectWithValue("NoToken");

      const res = await http.get("/auth/me");
      if (!res || !res.data) return rejectWithValue("InvalidSession");

      return res.data; 
    } catch (error) {
      console.log(error);
      
      return rejectWithValue("SessionExpired");
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
          state.loading = false;
          state.isAuthenticated = true;
          state.user = action.payload;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.isAuthenticated = false;
      })

      .addCase(loadSession.pending, (state) => {
        state.isCheckingSession = true; 
      })
      .addCase(loadSession.fulfilled, (state, action) => {
          state.isAuthenticated = true;
          state.user = action.payload;
          state.isCheckingSession = false; 
      })
      .addCase(loadSession.rejected, (state) => {
          state.isAuthenticated = false;
          state.user = null;
          state.isCheckingSession = false;
      });
  },
});

export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectIsCheckingSession = (state) => state.auth.isCheckingSession; 
export const { logout, updatePermissions } = authSlice.actions;
export default authSlice.reducer;