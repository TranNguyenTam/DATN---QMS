import {
    HomeOutlined,
    SaveOutlined,
    UnorderedListOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Input, Select, Typography } from "antd";

const { Text } = Typography;

/**
 * Thông tin phòng / hàng đợi cho các màn thao tác.
 *
 * Quy tắc render — theo yêu cầu "phòng và hàng đợi nào thì là phòng và hàng
 * đợi đó, không cần dropdown":
 *   - Sau khi hook đã filter theo module:
 *       · 0 phần tử → Alert cảnh báo user chưa được gán.
 *       · 1 phần tử → Input readonly (không có gì để chọn).
 *       · 2+ phần tử (thường chỉ xảy ra với ADMIN/bypass) → Select đổi.
 */
const DoctorInfoCard = ({
  info,
  phongBan,
  hangDoi,
  phongBanList,
  hangDoiList,
  onPhongBanChange,
  onHangDoiChange,
  moduleLabel = "module này",
  tenBacSi,
  setTenBacSi,
  onSave,
  hasTenBacSi = false,
}) => {
  const currentPhongBan = phongBan ?? info?.PhongBan;
  const currentHangDoi = hangDoi ?? info?.HangDoi;
  const pbOptions = phongBanList ?? info?.PhongBanList ?? [];
  const hdOptions = hangDoiList ?? info?.HangDoiList ?? [];

  const readonlyInputStyle = {
    width: "100%",
    borderRadius: 7,
    background: "#f8fafc",
    fontWeight: 500,
  };

  const renderField = ({ value, options, onChange, emptyMsg }) => {
    if (options.length === 0) {
      return (
        <Alert
          type="warning"
          message={emptyMsg}
          showIcon
          style={{ padding: "4px 10px", fontSize: 12 }}
        />
      );
    }
    if (options.length === 1 || !onChange) {
      return (
        <Input
          readOnly
          value={value?.FieldName || options[0]?.FieldName || ""}
          style={readonlyInputStyle}
        />
      );
    }
    return (
      <Select
        style={{ width: "100%" }}
        value={value?.FieldCode}
        onChange={(code) => {
          const chosen = options.find((o) => o.FieldCode === code);
          if (chosen) onChange(chosen);
        }}
        options={options.map((o) => ({
          label: o.FieldName || o.TenPhongBanDayDu || `#${o.FieldCode}`,
          value: o.FieldCode,
        }))}
        showSearch
        optionFilterProp="label"
      />
    );
  };

  return (
    <Card
      title={
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
          <HomeOutlined style={{ color: "#1677ff", marginRight: 6 }} />
          Thông tin phòng
        </span>
      }
      size="small"
      style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
      styles={{ body: { padding: "10px 14px" } }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>
            <HomeOutlined style={{ marginRight: 4 }} />
            PHÒNG
          </Text>
          {renderField({
            value: currentPhongBan,
            options: pbOptions,
            onChange: onPhongBanChange,
            emptyMsg: `Chưa gán phòng ban cho ${moduleLabel}`,
          })}
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>
            <UnorderedListOutlined style={{ marginRight: 4 }} />
            HÀNG ĐỢI
          </Text>
          {renderField({
            value: currentHangDoi,
            options: hdOptions,
            onChange: onHangDoiChange,
            emptyMsg: `Chưa gán hàng đợi cho ${moduleLabel}`,
          })}
        </div>
        {hasTenBacSi && (
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>
              <UserOutlined style={{ marginRight: 4 }} />
              BÁC SĨ
            </Text>
            <div style={{ display: "flex", gap: 6 }}>
              <Input
                style={{ flex: 1, borderRadius: 7 }}
                value={tenBacSi}
                onChange={(e) => setTenBacSi(e.target.value)}
                placeholder="Nhập tên bác sĩ..."
              />
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={onSave}
                style={{ borderRadius: 7, flexShrink: 0 }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DoctorInfoCard;
