import { CheckCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import {
    Alert,
    Button,
    Card,
    Col,
    Input,
    Row,
    Space,
    Table,
    Tag,
    Typography,
    message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import http from "../../util/httpClient";

const { Text } = Typography;

function CLSCheckInNoiTru() {
  const [loadingList, setLoadingList] = useState(false);
  const [loadingCheckIn, setLoadingCheckIn] = useState(false);
  const [maYTe, setMaYTe] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [rows, setRows] = useState([]);

  const fetchDanhSach = async () => {
    try {
      setLoadingList(true);
      const res = await http.get("/cls/noi-tru/danh-sach");
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      message.error(error?.message || "Không tải được danh sách nội trú");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchDanhSach();
  }, []);

  const handleCheckIn = async () => {
    const value = maYTe.trim();
    if (!value) {
      message.warning("Vui lòng nhập mã bệnh nhân");
      return;
    }

    try {
      setLoadingCheckIn(true);
      const res = await http.post("/cls/noi-tru/check-in", { maYTe: value });
      if (!res?.data || Array.isArray(res.data)) {
        message.error("Mã bệnh nhân đã check in, đã hủy hoặc không tồn tại");
        return;
      }

      const benhNhan = res.data.benhNhan || {};
      const tenBenhNhan =
        benhNhan?.TENBENHNHAN || benhNhan?.TenBenhNhan || "Bệnh nhân";
      const namSinh = benhNhan?.NAMSINH || benhNhan?.NamSinh || "-";

      const msg = `${tenBenhNhan} - Năm sinh: ${namSinh} đã được thêm vào hàng chờ CLS.`;
      setLastMessage(msg);
      message.success("Check-in nội trú thành công");
      setMaYTe("");
      fetchDanhSach();
    } catch (error) {
      console.error(error);
      message.error(error?.message || "Có lỗi khi check-in bệnh nhân nội trú");
    } finally {
      setLoadingCheckIn(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "SoThuTuDayDu",
        key: "stt",
        width: 70,
        align: "center",
        render: (v, r) => (
          <Tag color="blue" style={{ fontWeight: 600 }}>
            {v || r?.STT || "-"}
          </Tag>
        ),
      },
      {
        title: "Mã y tế",
        dataIndex: "MaYTe",
        key: "maYTe",
        width: 110,
      },
      {
        title: "Bệnh nhân",
        dataIndex: "TenBenhNhan",
        key: "ten",
        width: 200,
        render: (v, r) => (
          <div>
            <div style={{ fontWeight: 600 }}>{v || "-"}</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Năm sinh: {r?.NamSinh || "-"}
            </div>
          </div>
        ),
      },
      {
        title: "Hàng đợi CLS",
        dataIndex: "TenHangDoi",
        key: "hangDoi",
        width: 140,
        render: (v) => <Tag color="purple">{v || "-"}</Tag>,
      },
      {
        title: "Dịch vụ",
        dataIndex: "NoiDung",
        key: "noiDung",
        ellipsis: true,
      },
      {
        title: "Giờ check-in",
        dataIndex: "NgayGioLaySo",
        key: "gio",
        width: 130,
        render: (v) =>
          v ? new Date(v).toLocaleTimeString("vi-VN", { hour12: false }) : "-",
      },
      {
        title: "Trạng thái",
        dataIndex: "TinhTrang",
        key: "tinhTrang",
        width: 130,
        render: (v, r) => {
          if (r?.NgayGioHoanTat) return <Tag color="green">Đã hoàn tất</Tag>;
          if (r?.NgayGioThucHien) return <Tag color="processing">Đang thực hiện</Tag>;
          return <Tag color="orange">Đang chờ</Tag>;
        },
      },
    ],
    [],
  );

  const getRowKey = (record) =>
    String(
      record?.HangDoiPhongBan_Id ||
        record?.BenhNhan_Id ||
        record?.SoPhieuYeuCau ||
        record?.STT ||
        record?.MaYTe ||
        JSON.stringify(record),
    );

  return (
    <Row gutter={[12, 12]} style={{ height: "100%" }}>
      <Col span={24}>
        <Alert
          showIcon
          type="info"
          message="Phiên bản QMS_DA standalone chỉ hỗ trợ ngoại trú"
          description={
            <span>
              Module nội trú yêu cầu kết nối HIS (bảng HIS_TT_NOITRU_BENHAN +
              bệnh án) để load chỉ định CLS theo bệnh án. Ở bản chạy local này,
              mọi tiếp nhận đều dạng <Text code>LoaiPhieu = 'NgoaiTru'</Text> →
              danh sách dưới đây sẽ luôn trống. Đây là <b>hạn chế đã ghi nhận</b>{" "}
              trong tài liệu thiết kế, không phải lỗi.
            </span>
          }
        />
      </Col>
      <Col xs={24} lg={8}>
        <Card title="Check-in CLS nội trú" style={{ height: "100%" }}>
          <Space orientation="vertical" style={{ width: "100%" }} size={12}>
            <Text strong>Quét/Nhập mã y tế hoặc số vào viện</Text>
            <Input
              autoFocus
              value={maYTe}
              onChange={(e) => setMaYTe(e.target.value)}
              onPressEnter={handleCheckIn}
              placeholder="Mã y tế / Số vào viện / CCCD (VD: 210009384)"
              size="large"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chỉ áp dụng cho bệnh nhân nội trú có chỉ định CLS chưa thực hiện
              (CT, X-Quang, Siêu âm, Đo loãng xương, Điện tim).
            </Text>

            <Space>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={loadingCheckIn}
                onClick={handleCheckIn}
              >
                Check-in
              </Button>
              <Button
                icon={<ReloadOutlined />}
                loading={loadingList}
                onClick={fetchDanhSach}
              >
                Tải lại danh sách
              </Button>
            </Space>

            {lastMessage ? (
              <Alert type="success" showIcon message={lastMessage} />
            ) : null}
          </Space>
        </Card>
      </Col>

      <Col xs={24} lg={16}>
        <Card
          title="Bệnh nhân nội trú đã check-in CLS hôm nay"
          extra={<Text type="secondary">Tổng số: {rows.length}</Text>}
          style={{ height: "100%" }}
          styles={{ body: { height: "calc(100% - 56px)" } }}
        >
          <Table
            bordered
            loading={loadingList}
            dataSource={rows}
            columns={columns}
            rowKey={getRowKey}
            pagination={{ pageSize: 12, showSizeChanger: true }}
            scroll={{ x: "max-content", y: "calc(100vh - 300px)" }}
            locale={{
              emptyText:
                "Chưa có bệnh nhân nội trú nào check-in CLS hôm nay",
            }}
          />
        </Card>
      </Col>
    </Row>
  );
}

export default CLSCheckInNoiTru;
