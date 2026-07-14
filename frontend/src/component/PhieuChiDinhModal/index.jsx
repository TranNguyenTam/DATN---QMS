import {
  CheckOutlined,
  DollarOutlined,
  MedicineBoxOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { Alert, Button, Modal, Typography } from "antd";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";

const { Text } = Typography;

/**
 * Modal "Bệnh án đã lưu — bước tiếp theo" hiện sau khi bác sĩ submit.
 * Mô hình doctor-transfer (giống K_QMS): submit chỉ LƯU lâm sàng, KHÔNG đẩy
 * BN vào hàng đợi nào. Bác sĩ quyết định bước tiếp ngay tại đây.
 *
 *  - Có chỉ định CLS/CDHA (phieus > 0): in phiếu QR cho BN đi làm CLS.
 *    KHÔNG chuyển viện phí/nhà thuốc (BN chưa xong, sẽ quay lại).
 *  - Không CLS: hiện nút chuyển sang Viện phí / Nhà thuốc / Hoàn tất.
 *
 * Props: open, onClose, patient {TenBenhNhan, MaYTe, SoThuTuDayDu, HangDoiPhongBan_Id},
 *        tenBacSi, phieus[], onTransfer(hdpbId, dest)  // dest: 'vp'|'nt'|'both'|'done'
 */
export default function PhieuChiDinhModal({ open, onClose, patient, tenBacSi, phieus = [], onTransfer }) {
  const printRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const coCLS = phieus.length > 0;
  const hdpbId = patient?.HangDoiPhongBan_Id;

  // GỘP phiếu theo PHÒNG: nhiều dịch vụ cùng 1 phòng → 1 phiếu + 1 QR (BN quét 1
  // lần, KTV thấy hết). Backend khi quét 1 SoPhieu trả NoiDung gồm mọi DV cùng
  // phòng/ngày → 1 lần check-in đủ. (Tránh ra nhiều QR cho cùng 1 phòng.)
  const groupedPhieus = (() => {
    const map = new Map();
    for (const p of phieus) {
      const key = p.PhongBan_Id ?? p.TenPhongBan ?? p.HangDoi_Id ?? p.SoPhieu;
      if (!map.has(key)) map.set(key, { ...p, services: [] });
      map.get(key).services.push(p.TenDichVu);
    }
    return [...map.values()];
  })();

  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=480,height=720");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Phiếu chỉ định</title>
<style>
  * { font-family: 'Segoe UI', Arial, sans-serif; box-sizing: border-box; }
  body { margin: 0; padding: 10px; }
  .phieu { border: 1px dashed #999; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
  .phieu h3 { margin: 0 0 6px; font-size: 15px; text-align: center; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .info { font-size: 13px; line-height: 1.5; }
  .sophieu { font-family: 'Consolas', monospace; font-size: 16px; font-weight: bold; letter-spacing: 1px; }
  .phong { font-size: 14px; font-weight: bold; color: #000; }
  .muted { color: #555; font-size: 12px; }
  .hr { border-top: 1px solid #ddd; margin: 6px 0; }
</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  const transfer = async (dest) => {
    if (!hdpbId || !onTransfer) return;
    setBusy(true);
    try {
      await onTransfer(hdpbId, dest);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={480}
      title=" Bệnh án đã lưu "
      footer={[
        <Button key="close" onClick={onClose}>Đóng</Button>,
        coCLS && (
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            In phiếu
          </Button>
        ),
      ].filter(Boolean)}
      destroyOnClose
    >
      {coCLS ? (
        <>
          <div ref={printRef}>
            {groupedPhieus.map((p, idx) => (
              <div
                key={p.SoPhieu || idx}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 12,
                  background: "#fff",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    textAlign: "center",
                    padding: "10px 14px 8px",
                    borderBottom: "3px solid #1677ff",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1 }}>
                    BỆNH VIỆN Y HỌC CỔ TRUYỀN
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#0f172a",
                      letterSpacing: 0.5,
                    }}
                  >
                    PHIẾU CHỈ ĐỊNH CẬN LÂM SÀNG
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      marginBottom: 3,
                    }}
                  >
                    <span>
                      <b>Bệnh nhân:</b> {patient?.TenBenhNhan || "—"}
                    </span>
                    <span style={{ color: "#475569" }}>
                      STT khám: <b>{patient?.SoThuTuDayDu || "—"}</b>
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    <span>Mã y tế: {patient?.MaYTe || "—"}</span>
                    <span>BS: {tenBacSi || "—"}</span>
                  </div>
                  <div
                    style={{
                      borderTop: "1px dashed #cbd5e1",
                      margin: "10px 0",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#0369a1",
                          marginBottom: 5,
                        }}
                      >
                        {p.TenPhongBan || `Phòng (HĐ ${p.HangDoi_Id})`}
                      </div>
                      <div
                        style={{ fontSize: 14, color: "#0f172a", marginBottom: 8 }}
                      >
                        {(p.services && p.services.length
                          ? p.services
                          : [p.TenDichVu]
                        ).map((s, i) => (
                          <div key={i}>• {s}</div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Số phiếu</div>
                      <div
                        style={{
                          fontFamily: "Consolas, monospace",
                          fontSize: 20,
                          fontWeight: 800,
                          letterSpacing: 1,
                          color: "#0f172a",
                        }}
                      >
                        {p.SoPhieu}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          display: "inline-block",
                          padding: 8,
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                        }}
                      >
                        <QRCodeSVG
                          value={String(p.SoPhieu)}
                          size={104}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#94a3b8",
                          marginTop: 4,
                          maxWidth: 124,
                        }}
                      >
                        Quét tại phòng để check-in
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </>
      ) : (
        <>
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
            message="Khám xong"
            description="Chọn bước tiếp theo cho bệnh nhân. BN sẽ vào hàng đợi tương ứng và được gọi khi tới quầy."
          />
          <Text strong>Chuyển bệnh nhân sang:</Text>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <Button
              type="primary"
              block
              size="large"
              loading={busy}
              icon={<DollarOutlined />}
              onClick={() => transfer("both")}
            >
              Viện phí + Nhà thuốc
            </Button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Button loading={busy} icon={<MedicineBoxOutlined />} onClick={() => transfer("nt")}>
                Chỉ Nhà thuốc
              </Button>
              <Button loading={busy} icon={<DollarOutlined />} onClick={() => transfer("vp")}>
                Chỉ Viện phí
              </Button>
            </div>
            <Button type="text" loading={busy} icon={<CheckOutlined />} onClick={() => transfer("done")}>
              Hoàn tất, không chuyển (chỉ tư vấn)
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
