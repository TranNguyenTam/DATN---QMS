// ============================================================================
// QMS Design System — AntD ConfigProvider theme (single source of truth).
// Mirrors src/styles/tokens.scss ($ vars + CSS variables).
// UI/UX only — không đổi logic. Đổi token ở đây → mọi component AntD đồng bộ.
// ============================================================================

export const tokens = {
  primary: "#1677ff",
  primaryHover: "#2a8eff",
  secondary: "#003a8c", // navy (sidebar, brand header)
  success: "#52c41a",
  warning: "#faad14",
  error: "#ff4d4f",
  info: "#1677ff",
  bg: "#f0f4f8", // app canvas
  surface: "#ffffff",
  surfaceAlt: "#f8fafc", // table header / subtle surface
  bgInfo: "#e6f4ff", // light blue tint
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  textPrimary: "#1a2332",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  accentOrange: "#e85d04", // Tivi STT accent
  radiusSm: 6,
  radiusMd: 8,
  radiusLg: 10,
  radiusXl: 14,
};

export const antdTheme = {
  token: {
    colorPrimary: tokens.primary,
    colorSuccess: tokens.success,
    colorWarning: tokens.warning,
    colorError: tokens.error,
    colorInfo: tokens.info,
    colorBgLayout: tokens.bg,
    colorBorder: tokens.border,
    colorText: tokens.textPrimary,
    colorTextSecondary: tokens.textSecondary,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    borderRadius: tokens.radiusMd,
    controlHeight: 36,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  components: {
    Button: { borderRadius: tokens.radiusSm, fontWeight: 500, controlHeight: 36 },
    Card: { borderRadiusLG: tokens.radiusLg },
    Table: {
      headerBg: tokens.surfaceAlt,
      headerColor: tokens.textSecondary,
      rowHoverBg: "#eff6ff",
      cellPaddingBlock: 8,
      cellPaddingInline: 14,
    },
    Modal: { borderRadiusLG: tokens.radiusXl },
    Input: { borderRadius: tokens.radiusMd },
    Select: { borderRadius: tokens.radiusMd },
    DatePicker: { borderRadius: tokens.radiusMd },
    Tag: { borderRadiusSM: tokens.radiusSm },
    Form: { itemMarginBottom: 16 },
  },
};
