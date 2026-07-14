import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Radio,
  Row,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  PrinterOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import PageHeader from "../../../component/PageHeader";
import http from "../../../util/httpClient";

const fmt = (n) => (Number(n) || 0).toLocaleString("vi-VN") + " đ";
const HD_VIENPHI = 4;
const PB_VIENPHI = 8;

const LOAI = {
  KhamBenh: { color: "blue", text: "Khám" },
  CLS: { color: "green", text: "Xét nghiệm" },
  CDHA: { color: "cyan", text: "CĐHA" },
  Thuoc: { color: "purple", text: "Thuốc" },
};
const loaiText = (v) => LOAI[v]?.text || v;
const ptText = { TienMat: "Tiền mặt", Chuyen: "Chuyển khoản", The: "Thẻ" };

export default function ThanhToanVienPhi() {
  const [params] = useSearchParams();
  const preselectDone = useRef(false);

  const [tab, setTab] = useState("cho");
  const [keyword, setKeyword] = useState("");

  const [dsCho, setDsCho] = useState([]);
  const [loadingCho, setLoadingCho] = useState(false);
  const [dsDaThu, setDsDaThu] = useState([]);
  const [loadingDaThu, setLoadingDaThu] = useState(false);

  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [mienGiam, setMienGiam] = useState(0);
  const [bhyt, setBhyt] = useState(0);
  const [phuongThuc, setPhuongThuc] = useState("TienMat");
  const [submitting, setSubmitting] = useState(false);

  const loadCho = useCallback(async () => {
    setLoadingCho(true);
    try {
      const [cho, goi] = await Promise.all([
        http.get("/vien-phi/hang-cho", { hangDoiId: HD_VIENPHI }),
        http.get("/vien-phi/da-goi", {
          hangDoiId: HD_VIENPHI,
          phongBanId: PB_VIENPHI,
        }),
      ]);
      // "Chờ thu" chỉ gồm BN CHƯA thu: da-goi (SelectDaGoiTrongNgay) có cả BN đã
      // hoàn tất (TinhTrang=2 → 'Hoàn tất') để làm nhật ký bên Gọi bệnh → loại ở đây.
      const goiRows = (goi?.data || []).filter((r) => r.TinhTrang !== "Hoàn tất");
      const merged = [...goiRows, ...(cho?.data || [])];
      const seen = new Set();
      setDsCho(
        merged.filter((r) => {
          const id = r.HangDoiPhongBan_Id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        }),
      );
    } catch (e) {
      message.error(e?.message || "Lỗi tải danh sách chờ thu");
    } finally {
      setLoadingCho(false);
    }
  }, []);

  const loadDaThu = useCallback(async () => {
    setLoadingDaThu(true);
    try {
      const res = await http.get("/vien-phi/hoa-don-da-thu");
      setDsDaThu(res?.data || []);
    } catch (e) {
      message.error(e?.message || "Lỗi tải hoá đơn đã thu");
    } finally {
      setLoadingDaThu(false);
    }
  }, []);

  useEffect(() => {
    loadCho();
    loadDaThu();
  }, [loadCho, loadDaThu]);

  const resetBill = () => {
    setDraft(null);
    setMienGiam(0);
    setBhyt(0);
    setPhuongThuc("TienMat");
  };

  const loadDraftByTiepNhan = useCallback(async (tiepNhanId) => {
    const res = await http.get(`/vien-phi/hoa-don/${tiepNhanId}`);
    return res?.data || { none: true };
  }, []);

  const pickCho = useCallback(
    async (row) => {
      setSelected(row);
      resetBill();
      setLoadingDraft(true);
      try {
        let tiepNhanId = row.TIEPNHAN_ID || row.TiepNhan_Id;
        let benhNhanId = row.BenhNhan_Id || row.BENHNHAN_ID;
        if (!tiepNhanId) {
          const info = await http.get(
            `/vien-phi/thanh-toan-info/${row.HangDoiPhongBan_Id}`,
          );
          const i = info?.data?.[0] || {};
          tiepNhanId = i.tiepNhanId;
          benhNhanId = benhNhanId || i.benhNhanId;
        }
        setSelected({ ...row, TiepNhan_Id: tiepNhanId, BenhNhan_Id: benhNhanId });
        if (!tiepNhanId) {
          setDraft({ none: true });
          return;
        }
        const d = await loadDraftByTiepNhan(tiepNhanId);
        setDraft(d);
        if (!d.DaCoHoaDon && d.BhytChiTraGoiY) setBhyt(Number(d.BhytChiTraGoiY));
      } catch (e) {
        if (e?.status === 404) setDraft({ none: true });
        else message.error(e?.message || "Lỗi tải hoá đơn");
      } finally {
        setLoadingDraft(false);
      }
    },
    [loadDraftByTiepNhan],
  );

  const pickDaThu = useCallback(
    async (row) => {
      setSelected({ ...row, TiepNhan_Id: row.TiepNhan_Id, _daThu: true });
      resetBill();
      setLoadingDraft(true);
      try {
        setDraft(await loadDraftByTiepNhan(row.TiepNhan_Id));
      } catch (e) {
        message.error(e?.message || "Lỗi tải hoá đơn");
      } finally {
        setLoadingDraft(false);
      }
    },
    [loadDraftByTiepNhan],
  );

  useEffect(() => {
    if (preselectDone.current) return;
    const hdpb = params.get("hdpb");
    if (hdpb && dsCho.length) {
      const row = dsCho.find(
        (r) => String(r.HangDoiPhongBan_Id) === String(hdpb),
      );
      if (row) {
        preselectDone.current = true;
        setTab("cho");
        pickCho(row);
      }
    }
  }, [params, dsCho, pickCho]);

  const items = draft?.Items || [];
  const tongGoc = Number(draft?.TongTienGoc || 0);
  const daCoHd = draft?.DaCoHoaDon === true;
  const daThu = daCoHd && draft?.TrangThai === "DaThu";
  const tyLe = Number(draft?.TyLeBhyt || 0);

  const mgShow = daCoHd ? Number(draft?.MienGiam || 0) : mienGiam || 0;
  const bhytShow = daCoHd ? Number(draft?.BHYT_ChiTra || 0) : bhyt || 0;
  const phaiThu = daCoHd
    ? Number(draft?.BenhNhan_PhaiThu || 0)
    : Math.max(0, tongGoc - (mienGiam || 0) - (bhyt || 0));

  // Bước 1: tạo hoá đơn (chốt miễn giảm + BHYT). Sau đó mới in / thu được.
  const handleTaoHoaDon = async () => {
    if (!selected?.TiepNhan_Id || !selected?.BenhNhan_Id) {
      return message.error("Thiếu thông tin bệnh nhân");
    }
    setSubmitting(true);
    try {
      await http.post("/vien-phi/lap-hoa-don", {
        tiepNhan_Id: selected.TiepNhan_Id,
        benhNhan_Id: selected.BenhNhan_Id,
        mienGiam,
        bhyT_ChiTra: bhyt,
      });
      const d = await loadDraftByTiepNhan(selected.TiepNhan_Id);
      setDraft(d);
      message.success("Đã tạo hoá đơn — có thể in & thu tiền");
    } catch (e) {
      message.error(e?.message || "Lỗi tạo hoá đơn");
    } finally {
      setSubmitting(false);
    }
  };

  // Bước 2: thu tiền → hoàn tất → tự chuyển Nhà thuốc (nếu có thuốc).
  const handleThuTien = async () => {
    const hoaDonId = draft?.HoaDon_Id;
    if (!hoaDonId) return;
    setSubmitting(true);
    try {
      await http.post("/vien-phi/thu-tien", {
        hoaDon_Id: hoaDonId,
        phuongThuc,
        hangDoiPhongBan_Id: selected.HangDoiPhongBan_Id,
      });
      message.success(`Đã thu ${fmt(phaiThu)}`);
      setSelected(null);
      resetBill();
      loadCho();
      loadDaThu();
    } catch (e) {
      message.error(e?.message || "Lỗi thu tiền");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!daCoHd) return;
    const rows = items
      .map(
        (it, i) =>
          `<tr><td>${i + 1}</td><td>${it.TenDichVu || ""}</td>` +
          `<td class="c">${it.SoLuong || 1}</td><td class="r">${fmt(
            it.DonGia,
          )}</td><td class="r">${fmt(it.ThanhTien)}</td></tr>`,
      )
      .join("");
    const soHd = draft.SoHoaDon || "—";
    const ngay = draft.NgayThu
      ? new Date(draft.NgayThu).toLocaleString("vi-VN")
      : new Date().toLocaleString("vi-VN");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hoá đơn ${soHd}</title>
<style>
  *{font-family:'Times New Roman',serif;box-sizing:border-box;color:#111}
  body{margin:0;padding:24px}
  .head{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
  .org{font-size:13px;font-weight:bold;text-transform:uppercase}
  .org small{font-weight:normal;display:block;font-size:11px}
  h1{font-size:20px;margin:10px 0 2px}
  .no{font-size:12px;color:#333}
  .meta{font-size:13px;line-height:1.8;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #555;padding:5px 8px}
  th{background:#f0f0f0}
  td.r,th.r{text-align:right} td.c,th.c{text-align:center}
  .sum{width:300px;margin-left:auto;font-size:13px;line-height:1.9;margin-top:10px}
  .sum .row{display:flex;justify-content:space-between;padding:2px 0}
  .sum .grand{border-top:1px solid #111;margin-top:4px;padding-top:6px;font-weight:bold;font-size:15px}
  .sign{display:flex;justify-content:space-around;margin-top:36px;font-size:13px;text-align:center}
  .sign i{font-size:11px;color:#444}
</style></head><body>
  <div class="head">
    <div class="org">Bệnh viện Y học cổ truyền<small>Số 342 Phan Châu Trinh, Đà Nẵng</small></div>
    <h1>HOÁ ĐƠN VIỆN PHÍ</h1>
    <div class="no">Số: ${soHd} &nbsp;·&nbsp; Ngày ${ngay}</div>
  </div>
  <div class="meta">
    <b>Họ tên người bệnh:</b> ${selected.TenBenhNhan || "—"}<br/>
    ${draft.TenDoiTuong ? `<b>Đối tượng:</b> ${draft.TenDoiTuong}<br/>` : ""}
  </div>
  <table>
    <thead><tr><th class="c" style="width:36px">#</th><th>Nội dung</th><th class="c" style="width:44px">SL</th><th class="r" style="width:110px">Đơn giá</th><th class="r" style="width:120px">Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sum">
    <div class="row"><span>Cộng tiền dịch vụ:</span><span>${fmt(tongGoc)}</span></div>
    <div class="row"><span>Miễn giảm:</span><span>${fmt(mgShow)}</span></div>
    <div class="row"><span>BHYT chi trả:</span><span>${fmt(bhytShow)}</span></div>
    <div class="row grand"><span>Người bệnh thanh toán:</span><span>${fmt(phaiThu)}</span></div>
  </div>
  <div class="sign">
    <div>Người nộp tiền<br/><i>(Ký, ghi rõ họ tên)</i></div>
    <div>Người thu tiền<br/>${draft.TenNhanVienThu || ""}<br/><i>(Ký, ghi rõ họ tên)</i></div>
  </div>
</body></html>`;
    const w = window.open("", "_blank", "width=580,height=780");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300);
  };

  const list = tab === "cho" ? dsCho : dsDaThu;
  const loadingList = tab === "cho" ? loadingCho : loadingDaThu;
  const filtered = useMemo(() => {
    const t = keyword.trim().toLowerCase();
    if (!t) return list;
    return list.filter((r) =>
      `${r.TenBenhNhan || ""} ${r.SoThuTuDayDu || ""} ${r.STT || ""} ${r.SoHoaDon || ""}`
        .toLowerCase()
        .includes(t),
    );
  }, [list, keyword]);

  const colsCho = [
    {
      title: "STT",
      dataIndex: "SoThuTuDayDu",
      width: 64,
      render: (v, r) => <span style={{ fontWeight: 600 }}>{v || r.STT || "-"}</span>,
    },
    { title: "Tên bệnh nhân", dataIndex: "TenBenhNhan", render: (v) => v || "—" },
  ];
  const colsDaThu = [
    { title: "Số HĐ", dataIndex: "SoHoaDon", width: 118 },
    { title: "Bệnh nhân", dataIndex: "TenBenhNhan", render: (v) => v || "—" },
    {
      title: "Phải thu",
      dataIndex: "BenhNhan_PhaiThu",
      width: 96,
      align: "right",
      render: (v) => fmt(v),
    },
  ];

  const sumRow = (label, value, strong) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 0",
        fontWeight: strong ? 700 : 400,
      }}
    >
      <span style={{ color: "#475569" }}>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div>
      <PageHeader
        icon={<SafetyCertificateOutlined />}
        title="Thanh toán viện phí"
        subtitle="Tính tiền khám + cận lâm sàng + thuốc · tự áp BHYT theo đối tượng · tạo hoá đơn & thu tiền"
        tone="admin"
      />

      <Row gutter={16} style={{ marginTop: 12 }}>
        {/* ── Danh sách ── */}
        <Col xs={24} lg={9} xl={7}>
          <Card
            size="small"
            styles={{ body: { paddingTop: 12 } }}
            title={
              <Segmented
                size="small"
                value={tab}
                onChange={(v) => {
                  setTab(v);
                  setKeyword("");
                }}
                options={[
                  { label: `Chờ thu · ${dsCho.length}`, value: "cho" },
                  { label: `Đã thu · ${dsDaThu.length}`, value: "dathu" },
                ]}
              />
            }
            extra={
              <Tooltip title="Tải lại">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined spin={loadingList} />}
                  onClick={() => (tab === "cho" ? loadCho() : loadDaThu())}
                />
              </Tooltip>
            }
          >
            <Input
              allowClear
              placeholder={tab === "cho" ? "Tìm tên / STT" : "Tìm tên / số HĐ"}
              style={{ marginBottom: 10 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Table
              size="small"
              loading={loadingList}
              dataSource={filtered}
              rowKey={(r) =>
                tab === "cho" ? r.HangDoiPhongBan_Id : r.HoaDon_Id
              }
              pagination={false}
              scroll={{ y: 460 }}
              showHeader={false}
              locale={{
                emptyText:
                  tab === "cho" ? "Không có bệnh nhân chờ thu" : "Chưa có hoá đơn đã thu",
              }}
              onRow={(r) => ({
                onClick: () => (tab === "cho" ? pickCho(r) : pickDaThu(r)),
                style: { cursor: "pointer" },
              })}
              rowClassName={(r) =>
                (tab === "cho"
                  ? r.HangDoiPhongBan_Id === selected?.HangDoiPhongBan_Id
                  : r.HoaDon_Id === selected?.HoaDon_Id)
                  ? "tt-row-selected"
                  : ""
              }
              columns={tab === "cho" ? colsCho : colsDaThu}
            />
          </Card>
        </Col>

        {/* ── Hoá đơn ── */}
        <Col xs={24} lg={15} xl={17}>
          {!selected ? (
            <Card size="small" style={{ minHeight: 280 }}>
              <Empty
                style={{ marginTop: 60 }}
                description="Chọn bệnh nhân hoặc hoá đơn ở danh sách bên trái"
              />
            </Card>
          ) : loadingDraft ? (
            <Card size="small" style={{ minHeight: 280 }}>
              <div style={{ textAlign: "center", padding: 80 }}>
                <Spin />
              </div>
            </Card>
          ) : draft?.none ? (
            <Card size="small">
              <Alert
                showIcon
                type="info"
                message="Bệnh nhân chưa phát sinh chi phí — chưa thể lập hoá đơn."
              />
            </Card>
          ) : (
            <Card size="small" styles={{ body: { padding: 0 } }}>
              {/* Đầu hoá đơn */}
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: "1px solid #eef0f3",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
                    {selected.TenBenhNhan}
                    {(selected.SoThuTuDayDu || selected.STT) && (
                      <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                        {"  ·  STT "}
                        {selected.SoThuTuDayDu || selected.STT}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                    {draft.SoHoaDon ? `Hoá đơn ${draft.SoHoaDon}` : "Chưa lập hoá đơn"}
                    {draft.TenDoiTuong ? `  ·  ${draft.TenDoiTuong}` : "  ·  Không BHYT"}
                  </div>
                </div>
                <Space>
                  {daThu && <Tag color="success">Đã thu</Tag>}
                  {daCoHd && !daThu && <Tag color="processing">Đã lập HĐ</Tag>}
                  <Tooltip
                    title={daCoHd ? "" : "Tạo hoá đơn trước khi in"}
                  >
                    <Button
                      icon={<PrinterOutlined />}
                      disabled={!daCoHd}
                      onClick={handlePrint}
                    >
                      In hoá đơn
                    </Button>
                  </Tooltip>
                </Space>
              </div>

              {daThu && (
                <Alert
                  banner
                  type="success"
                  showIcon
                  message={`Đã thu lúc ${
                    draft?.NgayThu
                      ? new Date(draft.NgayThu).toLocaleString("vi-VN")
                      : ""
                  } · ${ptText[draft?.PhuongThuc] || draft?.PhuongThuc || ""}${
                    draft?.TenNhanVienThu ? ` · ${draft.TenNhanVienThu}` : ""
                  }`}
                />
              )}

              {/* Bảng chi phí */}
              <div style={{ padding: "12px 18px 0" }}>
                <Table
                  size="middle"
                  pagination={false}
                  dataSource={items}
                  rowKey={(r, i) => i}
                  locale={{ emptyText: "Không có khoản phí" }}
                  columns={[
                    {
                      title: "Khoản mục",
                      dataIndex: "TenDichVu",
                      render: (v, r) => (
                        <Space size={8}>
                          <Tag
                            color={LOAI[r.Loai]?.color || "default"}
                            style={{ marginInlineEnd: 0 }}
                          >
                            {loaiText(r.Loai)}
                          </Tag>
                          <span>{v}</span>
                        </Space>
                      ),
                    },
                    {
                      title: "SL",
                      dataIndex: "SoLuong",
                      width: 56,
                      align: "center",
                    },
                    {
                      title: "Đơn giá",
                      dataIndex: "DonGia",
                      width: 120,
                      align: "right",
                      render: fmt,
                    },
                    {
                      title: "Thành tiền",
                      dataIndex: "ThanhTien",
                      width: 130,
                      align: "right",
                      render: (v) => <span style={{ fontWeight: 600 }}>{fmt(v)}</span>,
                    },
                  ]}
                />
              </div>

              {/* Khối thanh toán — gom gọn bên phải (tổng kết + hình thức + nút) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "16px 18px 18px",
                }}
              >
                <div
                  style={{
                    width: 380,
                    maxWidth: "100%",
                    border: "1px solid #eef0f3",
                    borderRadius: 10,
                    padding: "14px 16px",
                    background: "#fafbfc",
                  }}
                >
                  {sumRow("Cộng tiền dịch vụ", fmt(tongGoc))}
                  {sumRow(
                    tyLe > 0
                      ? `BHYT chi trả (${Math.round(tyLe * 100)}%)`
                      : "BHYT chi trả",
                    daCoHd ? (
                      fmt(bhytShow)
                    ) : (
                      <InputNumber
                        size="small"
                        value={bhyt}
                        onChange={(v) => setBhyt(v || 0)}
                        min={0}
                        max={tongGoc}
                        style={{ width: 150 }}
                        formatter={(v) =>
                          `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                        }
                      />
                    ),
                  )}
                  <div
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      marginTop: 8,
                      paddingTop: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Người bệnh thanh toán</span>
                    <span
                      style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}
                    >
                      {fmt(phaiThu)}
                    </span>
                  </div>

                  {!daThu && (
                    <div style={{ marginTop: 14 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          marginBottom: 6,
                        }}
                      >
                        Hình thức thanh toán
                      </div>
                      <Radio.Group
                        value={phuongThuc}
                        onChange={(e) => setPhuongThuc(e.target.value)}
                      >
                        <Radio value="TienMat">Tiền mặt</Radio>
                        <Radio value="Chuyen">Chuyển khoản</Radio>
                        <Radio value="The">Thẻ</Radio>
                      </Radio.Group>

                      {!daCoHd ? (
                        <Button
                          type="primary"
                          block
                          size="large"
                          loading={submitting}
                          style={{ marginTop: 14, height: 46, fontWeight: 600 }}
                          onClick={handleTaoHoaDon}
                        >
                          Tạo hoá đơn
                        </Button>
                      ) : (
                        <Button
                          block
                          size="large"
                          loading={submitting}
                          style={{
                            marginTop: 14,
                            height: 46,
                            fontWeight: 600,
                            background: "#15803d",
                            borderColor: "#15803d",
                            color: "#fff",
                          }}
                          onClick={handleThuTien}
                        >
                          Xác nhận thu {fmt(phaiThu)}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
