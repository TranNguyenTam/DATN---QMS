import { Button, Space } from "antd";

/**
 * Banner gradient THỐNG NHẤT cho mọi trang admin / dashboard / list.
 * Design System "1 primary": tất cả dùng cùng gradient xanh→navy (token
 * primary → secondary). Mọi trang có CÙNG header (icon + tiêu đề + mô tả)
 * để "trông như một đội thiết kế". `colors` vẫn cho phép override khi cần.
 */
const PRIMARY_GRADIENT = ["#1677ff", "#003a8c"];
const TONE_MAP = {
  admin: PRIMARY_GRADIENT,
  dashboard: PRIMARY_GRADIENT,
  audit: PRIMARY_GRADIENT,
  metrics: PRIMARY_GRADIENT,
};

const PageHeader = ({
  icon,
  title,
  subtitle,
  tone = "admin",
  colors,
  extra,
  style = {},
}) => {
  const [start, end] = colors && colors.length === 2 ? colors : TONE_MAP[tone] || TONE_MAP.admin;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`,
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 16,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        boxShadow: `0 4px 14px ${start}40`,
        ...style,
      }}
    >
      {icon && <span style={{ fontSize: 32, lineHeight: 1 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 240 }}>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 22, fontWeight: 700 }}>
          {title}
        </h2>
        {subtitle && (
          <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
};

PageHeader.Button = ({ children, ...rest }) => (
  <Button
    {...rest}
    style={{
      background: "rgba(255,255,255,0.2)",
      borderColor: "rgba(255,255,255,0.3)",
      color: "#fff",
      ...(rest.style || {}),
    }}
  >
    {children}
  </Button>
);

export default PageHeader;
