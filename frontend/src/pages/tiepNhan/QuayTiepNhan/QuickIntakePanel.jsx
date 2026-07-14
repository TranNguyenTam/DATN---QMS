import { CheckCircleOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import http from "../../../util/httpClient";

const { Text } = Typography;

/**
 * Mini-form tiếp nhận BN vừa được gọi đến quầy — đúng nghiệp vụ WinForms:
 *
 * Sau khi quầy bấm "GỌI SỐ TIẾP THEO", BN đến quầy đưa giấy tờ. Nhân viên
 * dùng panel này để nhập mã y tế / BHYT / CCCD → tra ehospital → chọn gói
 * khám + ưu tiên + thu tiền → bấm XÁC NHẬN. Backend gọi
 * `sp_K_004_TiepNhanTuDong_VP` qua endpoint `/kiosk/tu-dong-tiep-nhan`,
 * tạo bản ghi mới trong `HangDoiPhongBan` với HangDoi_Id=3 (Khu Khám Bệnh).
 *
 * Hai bảng K_HangDoiTiepNhan và HangDoiPhongBan độc lập — STT đang gọi
 * trên quầy KHÔNG bị xóa, nhân viên có thể bấm "Gọi số tiếp theo" ngay
 * sau khi xác nhận, hoặc bỏ qua không xác nhận nếu BN vắng mặt.
 */
export default function QuickIntakePanel({ currentSTT, currentHdpbId }) {
  const [maYTe, setMaYTe] = useState("");
  const [benhNhan, setBenhNhan] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [dichVuOptions, setDichVuOptions] = useState([]);
  const [dichVuSelected, setDichVuSelected] = useState(null);
  const [loaiUuTienOptions, setLoaiUuTienOptions] = useState([]);
  const [loaiUuTienSelected, setLoaiUuTienSelected] = useState(null);
  const [uuTien, setUuTien] = useState(false);
  const [thuTienSau, setThuTienSau] = useState(false);

  // Load dropdown options 1 lần.
  useEffect(() => {
    (async () => {
      try {
        const [dvRes, uutRes] = await Promise.all([
          http.get("/kiosk/loai-dich-vu"),
          http.get("/kiosk/loai-uu-tien"),
        ]);
        setDichVuOptions(dvRes?.data || []);
        setLoaiUuTienOptions(uutRes?.data || []);
        const def = dvRes?.data?.[0]?.DICHVU_ID;
        if (def) setDichVuSelected(def);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const reset = useCallback(() => {
    setMaYTe("");
    setBenhNhan(null);
    setUuTien(false);
    setLoaiUuTienSelected(null);
    setThuTienSau(false);
    setDichVuSelected(dichVuOptions?.[0]?.DICHVU_ID || null);
  }, [dichVuOptions]);

  const handleSearch = async () => {
    if (!maYTe.trim()) {
      return message.warning("Vui lòng nhập mã y tế / BHYT / CCCD");
    }
    setSearching(true);
    try {
      const res = await http.get("/kiosk/check-ma", { maYTe: maYTe.trim() });
      const data = res?.data?.length > 0 ? res.data[0] : null;
      if (!data) {
        message.error("Không tìm thấy bệnh nhân");
        setBenhNhan(null);
        return;
      }
      // GhiChu_id 1 / 2 = thẻ BHYT có vấn đề (giống Kiosk).
      if (data.GhiChu_id == "1" || data.GhiChu_id == "2") {
        message.warning((data.GhiChu_ThongTuyen || "").toUpperCase() || "Thẻ không hợp lệ");
        setBenhNhan(null);
        return;
      }
      setBenhNhan({
        BenhNhan_Id: data.BenhNhan_Id,
        TenBenhNhan: data.TenBenhNhan,
        NamSinh: data.NamSinh,
        GioiTinh: data.GIOITINH,
        SoDienThoai: data.SODIENTHOAI,
      });
    } catch (e) {
      message.error(e?.message || "Lỗi tra cứu");
    } finally {
      setSearching(false);
    }
  };

  const handleConfirm = async () => {
    if (!benhNhan?.BenhNhan_Id) return message.warning("Hãy tra cứu bệnh nhân trước");
    if (uuTien && !loaiUuTienSelected) return message.warning("Chọn loại ưu tiên");
    setSubmitting(true);
    try {
      const res = await http.post("/kiosk/tu-dong-tiep-nhan", {
        benhNhanId: benhNhan.BenhNhan_Id,
        dichVuId: dichVuSelected,
        uuTien: uuTien ? 1 : 0,
        thuTienSau: thuTienSau ? 1 : 0,
        loaiUuTienText: uuTien ? loaiUuTienSelected : null,
        // Gắn BN vào lượt "lấy số nhanh" đang gọi → QR theo dõi tự nhảy sang Khám.
        tiepNhanHangDoiPhongBanId: currentHdpbId || 0,
      });
      const data = res?.data?.[0];
      if (!data) {
        message.error("Tiếp nhận thất bại");
        return;
      }
      message.success(
        `Đã tiếp nhận ${data.HoTenBenhNhan || benhNhan.TenBenhNhan} → ${data.TenHangDoi || "Khu Khám Bệnh"}`,
      );
      reset();
    } catch (e) {
      message.error(e?.message || "Lỗi xác nhận tiếp nhận");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card
      size="small"
      title={
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          <CheckCircleOutlined style={{ color: "#1677ff", marginRight: 6 }} />
          Tiếp nhận BN vừa gọi
          {currentSTT && (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              STT {currentSTT}
            </Tag>
          )}
        </span>
      }
      style={{ borderRadius: 12, border: "1px solid #e2e8f0", marginTop: 12 }}
      styles={{ body: { padding: "12px 14px" } }}
    >
      {!currentSTT && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8, padding: "4px 10px", fontSize: 12 }}
          message="Bấm Gọi số tiếp theo trước, sau đó nhập mã y tế của BN tại đây."
        />
      )}

      <Space.Compact style={{ width: "100%" }}>
        <Input
          placeholder="Mã y tế / BHYT / CCCD"
          value={maYTe}
          onChange={(e) => setMaYTe(e.target.value)}
          onPressEnter={handleSearch}
          disabled={!currentSTT}
          allowClear
          onClear={() => setBenhNhan(null)}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          loading={searching}
          disabled={!currentSTT}
          onClick={handleSearch}
        >
          Tìm
        </Button>
      </Space.Compact>

      {benhNhan && (
        <>
          <Descriptions
            size="small"
            column={1}
            style={{ marginTop: 10 }}
            labelStyle={{ fontSize: 12, color: "#6b7280" }}
            contentStyle={{ fontSize: 13, fontWeight: 500 }}
          >
            <Descriptions.Item label="Họ tên">{benhNhan.TenBenhNhan}</Descriptions.Item>
            <Descriptions.Item label="Năm sinh / Giới tính">
              {benhNhan.NamSinh || "—"} · {benhNhan.GioiTinh || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Điện thoại">
              {benhNhan.SoDienThoai || "—"}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>GÓI KHÁM</Text>
            <Select
              size="small"
              style={{ width: "100%", marginTop: 2 }}
              value={dichVuSelected}
              onChange={setDichVuSelected}
              options={dichVuOptions.map((d) => ({
                value: d.DICHVU_ID,
                label: d.TENDICHVU,
              }))}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <Radio.Group
              size="small"
              value={thuTienSau ? "sau" : "truoc"}
              onChange={(e) => setThuTienSau(e.target.value === "sau")}
            >
              <Radio.Button value="truoc">Thu tiền trước</Radio.Button>
              <Radio.Button value="sau">Thu tiền sau</Radio.Button>
            </Radio.Group>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <Checkbox
              checked={uuTien}
              onChange={(e) => {
                setUuTien(e.target.checked);
                if (!e.target.checked) setLoaiUuTienSelected(null);
              }}
            >
              Ưu tiên
            </Checkbox>
            <Select
              size="small"
              style={{ flex: 1 }}
              placeholder="Loại ưu tiên"
              value={loaiUuTienSelected}
              onChange={setLoaiUuTienSelected}
              disabled={!uuTien}
              options={loaiUuTienOptions.map((o) => ({
                value: o.FieldName,
                label: o.FieldName,
              }))}
            />
          </div>

          <Button
            type="primary"
            block
            size="middle"
            style={{ marginTop: 12 }}
            loading={submitting}
            onClick={handleConfirm}
          >
            XÁC NHẬN TIẾP NHẬN
          </Button>
        </>
      )}
    </Card>
  );
}
