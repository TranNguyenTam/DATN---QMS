import { ExclamationCircleFilled } from "@ant-design/icons";
import {
    Button,
    Card,
    Checkbox,
    Col,
    Input,
    InputNumber,
    Modal,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import ScanInput from "../../component/ScanInput";
import { EVENTS_NEED_REFRESH } from "../../const/const";
import { useSocket } from "../../hooks/useSocket";
import http from "../../util/httpClient";

const { Text } = Typography;

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isCdhaOrClsQueue = (item) => {
  const text = normalizeText(`${item?.FieldName || ""} ${item?.FieldCode || ""}`);
  return (
    text.includes("cls") ||
    text.includes("cdha") ||
    text.includes("chan doan") ||
    text.includes("xet nghiem") ||
    text.includes("sieu am") ||
    text.includes("x quang")
  );
};

const NhapBenhCDHA = () => {
  const [info, setInfo] = useState(null);
  const [hangDoiOptions, setHangDoiOptions] = useState([]);
  const [selectedHangDoi, setSelectedHangDoi] = useState(null);
  const [loadingInit, setLoadingInit] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [dsHangCho, setDsHangCho] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);

  const [formData, setFormData] = useState({
    maYTe: "",
    tenBenhNhan: "",
    namSinh: "",
    soPhieuYeuCau: "",
    noiDung: "",
    uuTien: false,
    soLuongChiDinh: 1,
    thoiGian: "Sang",
  });

  const hangDoiId = selectedHangDoi;
  const phongBanId = info?.PhongBan?.FieldCode;

  const fetchData = useCallback(async () => {
    if (!hangDoiId) return;
    try {
      setLoadingTable(true);
      const res = await http.get("/cls/hang-cho", { hangDoiId });
      setDsHangCho(res?.data || []);
    } catch (error) {
      message.error(error?.message || "Lỗi tải danh sách nhận bệnh");
    } finally {
      setLoadingTable(false);
    }
  }, [hangDoiId]);

  useEffect(() => {
    const initData = async () => {
      try {
        setLoadingInit(true);
        const [infoRes, hangDoiRes] = await Promise.all([
          http.get("/user/info"),
          http.get("/common/hang-doi"),
        ]);

        const userInfo = infoRes?.data || null;
        const listHangDoi = Array.isArray(hangDoiRes?.data) ? hangDoiRes.data : [];
        const preferQueues = listHangDoi.filter(isCdhaOrClsQueue);
        const finalQueueList = preferQueues.length > 0 ? preferQueues : listHangDoi;

        setInfo(userInfo);
        setHangDoiOptions(finalQueueList);

        const userQueueInModule = finalQueueList.find(
          (item) => item?.FieldCode === userInfo?.HangDoi?.FieldCode,
        );

        if (userQueueInModule) {
          setSelectedHangDoi(userQueueInModule.FieldCode);
        } else if (finalQueueList.length > 0) {
          setSelectedHangDoi(finalQueueList[0].FieldCode);
        } else {
          setSelectedHangDoi(null);
          message.warning("Không tìm thấy hàng đợi phù hợp cho CDHA/CLS");
        }
      } catch (error) {
        message.error(error?.message || "Không thể khởi tạo dữ liệu");
      } finally {
        setLoadingInit(false);
      }
    };

    initData();
  }, []);

  useEffect(() => {
    if (selectedHangDoi) {
      setSelectedRowKeys([]);
      setSelectedRows([]);
      fetchData();
    }
  }, [selectedHangDoi, fetchData]);

  const { isConnected, subscribe, unsubscribe } = useSocket();
  useEffect(() => {
    if (!isConnected || !hangDoiId) return;

    const __sub = subscribe("/topic/messages", (data) => {
      if (
        EVENTS_NEED_REFRESH.has(data?.event) &&
        data?.hangDoiId === hangDoiId
      ) {
        fetchData();
      }
    });

    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, fetchData, hangDoiId]);

  const fillFormByRecord = (record) => {
    setFormData({
      maYTe: record?.MaYTe || "",
      tenBenhNhan: record?.TenBenhNhan || "",
      namSinh: record?.NamSinh || "",
      soPhieuYeuCau: record?.SoPhieuYeuCau || "",
      noiDung: record?.NoiDungChiTiet || "",
      uuTien: String(record?.UuTien || "0") === "1",
      soLuongChiDinh: Number(record?.SoLuongChiDinh || 1),
      thoiGian: record?.ThoiGian || "Sang",
    });
  };

  const handleScanBarcode = async (barcode) => {
    if (!hangDoiId) return;
    try {
      const checkRes = await http.get("/cls/check-barcode", {
        soPhieu: barcode,
        hangDoiId,
      });
      const item = checkRes?.data?.[0];
      if (!item) {
        message.error("Số phiếu yêu cầu đã check in/hủy hoặc không tồn tại");
        return;
      }

      fillFormByRecord(item);

      const insertRes = await http.post("/cls/insert", {
        hangDoiId,
        benhNhanId: item.BenhNhan_Id,
        uuTien: item.UuTien,
        loaiPhieu: item.LoaiPhieu,
        noiDung: item.NoiDungChiTiet,
        clsYeuCauId: item.CLSYeuCau_Id,
        soLuongChiDinh: item.SoLuongChiDinh,
      });

      if (insertRes?.data?.length > 0) {
        message.success("Đã thêm bệnh nhân vào hàng chờ nhận bệnh");
        await fetchData();
      } else {
        message.error("Thêm bệnh nhân không thành công");
      }
    } catch (error) {
      message.error(error?.message || "Lỗi xử lý barcode");
    }
  };

  const handleUpdateSelected = async () => {
    if (!hangDoiId) return;
    if (selectedRows.length !== 1) {
      message.warning("Vui lòng chọn đúng 1 bệnh nhân để cập nhật");
      return;
    }

    try {
      const target = selectedRows[0];
      const res = await http.put("/cls/update", {
        hangDoiId,
        hangDoiPhongBanId: target.HangDoiPhongBan_Id,
        uuTien: formData.uuTien ? 1 : 0,
        noiDung: formData.noiDung || "",
        thoiGian: formData.thoiGian || "Sang",
        soLuongChiDinh: Number(formData.soLuongChiDinh || 1),
      });

      if (res?.data?.length > 0) {
        message.success("Đã cập nhật thông tin bệnh nhân");
        await fetchData();
      } else {
        message.error("Cập nhật không thành công");
      }
    } catch (error) {
      message.error(error?.message || "Lỗi cập nhật");
    }
  };

  const handleDeleteSelected = () => {
    if (!hangDoiId) return;
    if (selectedRows.length === 0) {
      message.warning("Vui lòng chọn bệnh nhân cần xóa");
      return;
    }
    // Form xác nhận + cảnh báo trước khi xóa hàng loạt khỏi hàng chờ.
    Modal.confirm({
      title: `Xóa ${selectedRows.length} bệnh nhân khỏi hàng chờ?`,
      icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
      content:
        "Bệnh nhân được chọn sẽ bị xóa khỏi hàng đợi nhận bệnh. Thao tác này KHÔNG thể hoàn tác.",
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          await Promise.all(
            selectedRows.map((row) =>
              http.del(`/cls/${row.HangDoiPhongBan_Id}`, { hangDoiId }),
            ),
          );
          message.success("Đã xóa bệnh nhân được chọn khỏi hàng chờ");
          setSelectedRowKeys([]);
          setSelectedRows([]);
          await fetchData();
        } catch (error) {
          message.error(error?.message || "Xóa bệnh nhân thất bại");
        }
      },
    });
  };

  const handleCallSelected = async () => {
    if (!hangDoiId || !phongBanId) return;
    if (selectedRows.length === 0) {
      message.warning("Vui lòng chọn bệnh nhân để gọi vào phòng nhận bệnh");
      return;
    }

    try {
      await Promise.all(
        selectedRows.map((row) =>
          http.post("/cls/goi-bn-da-chon", {
            hangDoiId,
            phongBanId,
            hangDoiPhongBanId: row.HangDoiPhongBan_Id,
          }),
        ),
      );
      message.success("Đã gọi bệnh nhân được chọn vào phòng nhận bệnh");
      await fetchData();
    } catch (error) {
      message.error(error?.message || "Gọi bệnh nhân thất bại");
    }
  };

  const tongHopPhongBan = useMemo(() => {
    const grouped = new Map();
    dsHangCho.forEach((item) => {
      const key = item?.TenPhongBan || "Chưa rõ";
      if (!grouped.has(key)) {
        grouped.set(key, { tenPhongBan: key, daGoi: 0 });
      }
      const row = grouped.get(key);
      if ((item?.TinhTrang || "").toLowerCase() !== "đang chờ") {
        row.daGoi += 1;
      }
    });
    return Array.from(grouped.values());
  }, [dsHangCho]);

  const columnsTongHop = [
    {
      title: "Tên phòng ban",
      dataIndex: "tenPhongBan",
      key: "tenPhongBan",
    },
    {
      title: "Đã gọi",
      dataIndex: "daGoi",
      key: "daGoi",
      align: "right",
      width: 90,
    },
  ];

  const columnsDanhSach = [
    {
      title: "STT",
      dataIndex: "SoThuTuDayDu",
      key: "SoThuTuDayDu",
      width: 90,
      render: (value) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: "Khung hẹn",
      dataIndex: "ThoiGian",
      key: "ThoiGian",
      width: 100,
      render: (value) => {
        if (value === "Sang") return <Tag color="green">Sáng</Tag>;
        if (value === "Chieu") return <Tag color="cyan">Chiều</Tag>;
        return value || "-";
      },
    },
    {
      title: "Tên bệnh nhân",
      dataIndex: "TenBenhNhan",
      key: "TenBenhNhan",
      width: 180,
    },
    {
      title: "Tuổi",
      dataIndex: "Tuoi",
      key: "Tuoi",
      width: 70,
      align: "center",
    },
    {
      title: "Đối tượng",
      dataIndex: "TenDoiTuong",
      key: "TenDoiTuong",
      width: 110,
    },
    {
      title: "Nội dung",
      dataIndex: "NoiDungChiTiet",
      key: "NoiDungChiTiet",
      width: 250,
    },
    {
      title: "SL chỉ định",
      dataIndex: "SoLuongChiDinh",
      key: "SoLuongChiDinh",
      width: 110,
      align: "right",
    },
    {
      title: "Loại",
      dataIndex: "LoaiBenhNhan",
      key: "LoaiBenhNhan",
      width: 90,
    },
    {
      title: "Tình trạng",
      dataIndex: "TinhTrang",
      key: "TinhTrang",
      width: 110,
    },
    {
      title: "Thời gian lấy số",
      dataIndex: "NgayGioLaySo",
      key: "NgayGioLaySo",
      width: 170,
    },
    {
      title: "Tên phòng ban",
      dataIndex: "TenPhongBan",
      key: "TenPhongBan",
      width: 160,
    },
    { title: "Kết quả", dataIndex: "KetQua", key: "KetQua", width: 120 },
  ];

  if (loadingInit) {
    return <></>;
  }

  return (
    <div style={{ padding: 12, height: "100%" }}>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 8]}>
          <Col xs={24} md={7}>
            <Text strong>Hàng đợi</Text>
            <Select
              style={{ width: "100%" }}
              value={hangDoiId}
              options={hangDoiOptions.map((item) => ({
                value: item.FieldCode,
                label: item.FieldName,
              }))}
              onChange={(value) => setSelectedHangDoi(value)}
            />
          </Col>

          <Col xs={24} md={7}>
            <Text strong>Quét phiếu yêu cầu</Text>
            <ScanInput onSubmit={handleScanBarcode} style={{ width: "100%" }} />
          </Col>

          <Col xs={24} md={4}>
            <Text strong>Buổi</Text>
            <Select
              value={formData.thoiGian}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, thoiGian: value }))
              }
              options={[
                { value: "Sang", label: "Buổi Sáng" },
                { value: "Chieu", label: "Buổi Chiều" },
              ]}
              style={{ width: "100%" }}
            />
          </Col>

          <Col
            xs={24}
            md={6}
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "flex-end",
            }}
          >
            <Space wrap style={{ justifyContent: "flex-end" }}>
              <Button danger onClick={handleDeleteSelected}>
                Xóa bệnh đang chọn
              </Button>
              <Button onClick={fetchData}>Làm tươi</Button>
              <Button type="primary" onClick={handleCallSelected}>
                Gọi bệnh nhân được chọn
              </Button>
            </Space>
          </Col>
        </Row>

        <Row gutter={[12, 8]} style={{ marginTop: 12 }}>
          <Col xs={24} md={4}>
            <Text strong>Mã y tế</Text>
            <Input value={formData.maYTe} readOnly />
          </Col>
          <Col xs={24} md={3}>
            <Text strong>Năm sinh</Text>
            <Input value={formData.namSinh} readOnly />
          </Col>
          <Col xs={24} md={5}>
            <Text strong>Tên bệnh nhân</Text>
            <Input value={formData.tenBenhNhan} readOnly />
          </Col>
          <Col xs={24} md={4}>
            <Text strong>Số phiếu yêu cầu</Text>
            <Input value={formData.soPhieuYeuCau} readOnly />
          </Col>
          <Col xs={24} md={4}>
            <Text strong>Số lượng chỉ định</Text>
            <InputNumber
              min={1}
              style={{ width: "100%" }}
              value={formData.soLuongChiDinh}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, soLuongChiDinh: value || 1 }))
              }
            />
          </Col>
          <Col
            xs={24}
            md={4}
            style={{ display: "flex", alignItems: "flex-end", gap: 8 }}
          >
            <Checkbox
              checked={formData.uuTien}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, uuTien: e.target.checked }))
              }
            >
              Ưu tiên
            </Checkbox>
            <Button type="primary" onClick={handleUpdateSelected}>
              Cập nhật
            </Button>
          </Col>
          <Col span={24}>
            <Text strong>Nội dung</Text>
            <Input.TextArea
              value={formData.noiDung}
              rows={3}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, noiDung: e.target.value }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ height: "calc(100% - 220px)" }}>
        <Col xs={24} md={6} style={{ height: "100%" }}>
          <Card size="small" title="Tổng hợp phòng" style={{ height: "100%" }}>
            <Table
              size="small"
              pagination={false}
              dataSource={tongHopPhongBan}
              columns={columnsTongHop}
              rowKey="tenPhongBan"
            />
          </Card>
        </Col>
        <Col xs={24} md={18} style={{ height: "100%" }}>
          <Card
            size="small"
            title="Danh sách nhận bệnh"
            style={{ height: "100%" }}
          >
            <Table
              size="small"
              loading={loadingTable}
              dataSource={dsHangCho}
              columns={columnsDanhSach}
              rowKey={(row) => row.HangDoiPhongBan_Id}
              scroll={{ x: 1500, y: 430 }}
              pagination={{ pageSize: 20 }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys, rows) => {
                  setSelectedRowKeys(keys);
                  setSelectedRows(rows);
                  if (rows.length === 1) {
                    fillFormByRecord(rows[0]);
                  }
                },
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default NhapBenhCDHA;
