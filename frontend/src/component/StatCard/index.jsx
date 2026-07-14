import { Card } from "antd";

/**
 * StatCard — thẻ số liệu thống nhất (Design System).
 * Nền trắng + chip icon màu ngữ nghĩa (thay các thẻ gradient cầu vồng) → đồng bộ "1 primary".
 * Props: title, value, icon, accent (màu nhấn hex 6 ký tự), precision, suffix.
 */
export default function StatCard({
  title,
  value,
  icon,
  accent = "#1677ff",
  precision,
  suffix,
}) {
  const display =
    precision != null && typeof value === "number"
      ? value.toFixed(precision)
      : value;
  return (
    <Card
      variant="borderless"
      styles={{ body: { padding: 16 } }}
      style={{ height: "100%", boxShadow: "var(--shadow-1)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            color: accent,
            background: `${accent}1a`,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginBottom: 2,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--color-text)",
              lineHeight: 1.1,
            }}
          >
            {display}
            {suffix && (
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  marginLeft: 4,
                }}
              >
                {suffix}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
