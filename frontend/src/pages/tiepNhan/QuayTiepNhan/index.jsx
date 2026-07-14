import {
    ControlOutlined,
    DeleteOutlined,
    RedoOutlined,
    StepForwardOutlined
} from "@ant-design/icons";
import {
    Button,
    Card,
    Col,
    Popconfirm,
    Row,
    Select,
    Space,
    Tag,
    Tooltip,
    Typography
} from "antd";
import { useMemo } from "react";
import CurrentPatientCard from "../../../component/CurrentPatientCard";
import DeviceCard from "../../../component/DeviceCard";
import QueueLists from "../../../component/QueueLists";
import { useQueueLogicTN } from "../../../hooks/useQueueLogicTN";
import { useWindowSize } from "../../../hooks/useWindownSize";
import QuickIntakePanel from "./QuickIntakePanel";
import "./QuayTiepNhan.scss";

const { Text } = Typography;
const { Option } = Select;

const QuayTiepNhan = () => {
  const { width } = useWindowSize();
  const {
    hangDoi,
    quay,
    selectedHangDoi,
    selectedQuay,
    dsHangCho,
    benhNhanMoi,
    initDevices,
    loading,
    loadingInit,
    actions,
  } = useQueueLogicTN();

  const listDangCho = useMemo(
    () => dsHangCho.filter((item) => item.TinhTrang === "Đang chờ"),
    [dsHangCho],
  );
  const listDaGoi = useMemo(() => {
    const sttNum = (r) =>
      Number(String(r.STTdb ?? r.STT ?? "").replace(/\D/g, "")) || 0;
    // Nguyên tắc: số VỪA GỌI (STT lớn nhất) nằm TRÊN CÙNG → sort giảm dần.
    return dsHangCho
      .filter((item) => item.TinhTrang !== "Đang chờ")
      .sort((a, b) => sttNum(b) - sttNum(a));
  }, [dsHangCho]);

  const columnsCho = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "STTdb",
        width: 70,
        align: "center",
        render: (text) => (
          <Tag
            color="blue"
            style={{
              fontSize: 13,
              fontWeight: "bold",
              minWidth: 40,
              textAlign: "center",
            }}
          >
            {text}
          </Tag>
        ),
      },
      {
        title: "Tên Bệnh Nhân",
        dataIndex: "TenBenhNhan",
        render: (t) => <span style={{ fontWeight: 500 }}>{t || "---"}</span>,
      },
      {
        title: "Tuổi",
        width: 55,
        align: "center",
        dataIndex: "Tuoi",
        render: (t) => <span style={{ color: "#64748b" }}>{t || "---"}</span>,
      },
      {
        title: "",
        width: 80,
        align: "center",
        render: (_, record) => (
          <Space size={4}>
            <Tooltip title="Bỏ qua">
              <Popconfirm
                placement="left"
                title="Bỏ qua bệnh nhân này?"
                onConfirm={() => actions.handleBoQua(record)}
              >
                <Button
                  size="small"
                  icon={<StepForwardOutlined />}
                  className="btn-skip"
                />
              </Popconfirm>
            </Tooltip>
            <Tooltip title="Xoá">
              <Popconfirm
                placement="left"
                title="Xoá khỏi hàng đợi?"
                onConfirm={() => actions.handleHuy(record)}
              >
                <Button
                  size="small"
                  icon={<DeleteOutlined />}
                  className="btn-delete"
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        ),
      },
    ],
    [actions],
  );

  const columnsDaGoi = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "STTdb",
        width: 70,
        align: "center",
        render: (text) => (
          <Tag
            color="default"
            style={{
              fontSize: 13,
              fontWeight: "bold",
              minWidth: 40,
              textAlign: "center",
            }}
          >
            {text}
          </Tag>
        ),
      },
      {
        title: "Tên Bệnh Nhân",
        dataIndex: "TenBenhNhan",
        render: (text, record) => (
          <div style={{ lineHeight: "1.3" }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{text || "---"}</div>
            <div
              style={{
                fontSize: 11,
                color:
                  record.TinhTrang === "Đã qua lượt" ? "#ef4444" : "#22c55e",
                fontWeight: 500,
              }}
            >
              {record.TinhTrang}
            </div>
          </div>
        ),
      },
      {
        title: "Tuổi",
        width: 55,
        align: "center",
        dataIndex: "Tuoi",
        render: (t) => <span style={{ color: "#64748b" }}>{t || "---"}</span>,
      },
      {
        title: "",
        width: 50,
        align: "center",
        render: (_, record) => (
          <Tooltip title="Gọi lại">
            <Popconfirm
              placement="left"
              title="Gọi lại bệnh nhân này?"
              onConfirm={() => actions.handleGoiLai(record)}
            >
              <Button
                size="small"
                type="primary"
                ghost
                icon={<RedoOutlined />}
                style={{ borderRadius: 6 }}
              />
            </Popconfirm>
          </Tooltip>
        ),
      },
    ],
    [actions],
  );

  if (loadingInit) return <></>;

  return (
    <div className="quay-tiep-nhan-wrapper">
      <Row gutter={[12, 12]} style={{ height: "100%" }}>
        {/* === CỘT TRÁI: ĐIỀU KHIỂN === */}
        <Col xs={24} md={8} lg={6} style={{ height: "100%" }}>
          <div className="left-panel-container">
            {/* Cấu hình quầy & hàng đợi */}
            <Card
              title={
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}
                >
                  <ControlOutlined
                    style={{ color: "#1677ff", marginRight: 6 }}
                  />
                  Cấu hình
                </span>
              }
              size="small"
              className="config-card"
            >
              <div style={{ marginBottom: 10 }}>
                <span className="config-label">Quầy</span>
                <Select
                  style={{ width: "100%" }}
                  value={selectedQuay}
                  onChange={actions.setSelectedQuay}
                  placeholder="Chọn quầy..."
                >
                  {quay.map((q) => (
                    <Option key={q.FieldCode} value={q.FieldCode}>
                      {q.FieldName}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <span className="config-label">Hàng đợi</span>
                <Select
                  style={{ width: "100%" }}
                  value={selectedHangDoi}
                  onChange={actions.setSelectedHangDoi}
                  placeholder="Chọn hàng đợi..."
                >
                  {hangDoi.map((h) => (
                    <Option key={h.FieldCode} value={h.FieldCode}>
                      {h.FieldName}
                    </Option>
                  ))}
                </Select>
              </div>
            </Card>
            <CurrentPatientCard
              patient={benhNhanMoi}
              onCallNext={actions.handleGoiBn}
              onRecall={() => actions.handleGoiLai(benhNhanMoi)}
              onSkip={() => actions.handleBoQua(benhNhanMoi)}
              noiChuyen={false}
            />
            <QuickIntakePanel
              currentSTT={benhNhanMoi?.STTdb || benhNhanMoi?.STT}
              currentHdpbId={benhNhanMoi?.HangDoiPhongBan_Id ?? benhNhanMoi?.HangDoiPhongBanId}
            />
            <DeviceCard initDevices={initDevices} />
          </div>
        </Col>

        {/* === CỘT PHẢI: DANH SÁCH === */}
        <Col xs={24} md={16} lg={18} style={{ height: "100%" }}>
          <QueueLists
            dsHangCho={listDangCho}
            dsDaGoi={listDaGoi}
            onSkip={actions.handleBoQua}
            onRecall={actions.handleGoiLai}
            columnsCho={columnsCho}
            columnsDaGoi={columnsDaGoi}
            layout={width < 1100 ? "vertical" : "horizontal"}
            loading={loading}
          />
        </Col>
      </Row>
    </div>
  );
};

export default QuayTiepNhan;
