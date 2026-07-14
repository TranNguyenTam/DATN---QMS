import { RedoOutlined, StepForwardOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Popconfirm,
  Row,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMemo } from "react";
import "./NhaThuocGoiBenh.scss";

import CurrentPatientCard from "../../component/CurrentPatientCard";
import DeviceCard from "../../component/DeviceCard";
import DoctorInfoCard from "../../component/DoctorInfoCard";
import QueueLists from "../../component/QueueLists";
import ScanInput from "../../component/ScanInput";
import { useQueueLogicVP } from "../../hooks/useQueueLogicVP";

const { Text } = Typography;

const NhaThuocGoiBenh = () => {
  const {
    info,
    selectedHangDoi,
    selectedPhongBan,
    setSelectedHangDoi,
    setSelectedPhongBan,
    moduleHangDoiList,
    modulePhongBanList,
    dsHangCho,
    dsDaGoi,
    benhNhanMoi,
    initDevices,
    actions,
    loadingInit,
  } = useQueueLogicVP("nhaThuoc");

  const columnsCho = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "SoThuTuDayDu",
        width: 70,
        align: "center",
        fixed: "left",
        render: (text) => (
          <Tag color="geekblue" style={{ fontSize: 14, fontWeight: 700 }}>
            {text}
          </Tag>
        ),
      },
      {
        title: "Tên Bệnh Nhân",
        dataIndex: "TenBenhNhan",
        width: 180,
        ellipsis: true,
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Đối tượng",
        dataIndex: "LoaiBenhNhan",
        width: 100,
        align: "center",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Tình trạng",
        dataIndex: "TinhTrang",
        width: 100,
        align: "center",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Nội dung đơn",
        dataIndex: "NoiDungChiTiet",
        width: 320,
        ellipsis: true,
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "TG thực hiện",
        dataIndex: "NgayGioThucHien",
        width: 170,
        align: "center",
        render: (t) => <span>{t || "-"}</span>,
      },
      {
        title: "TG lấy số",
        dataIndex: "NgayGioLaySo",
        width: 170,
        align: "center",
        render: (t) => <span>{t || "-"}</span>,
      },
      {
        title: "Tuổi",
        dataIndex: "Tuoi",
        width: 60,
        align: "center",
      },
      {
        title: "#",
        width: 60,
        align: "center",
        fixed: "right",
        render: (_, record) => (
          <Tooltip title="Bỏ qua">
            <Popconfirm
              placement="left"
              title="Bỏ qua?"
              onConfirm={() => actions.handleBoQua(record)}
            >
              <Button
                size="small"
                icon={<StepForwardOutlined />}
                className="btn-skip"
              />
            </Popconfirm>
          </Tooltip>
        ),
      },
    ],
    [actions],
  );

  const columnsDaGoi = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "SoThuTuDayDu",
        width: 70,
        align: "center",
        fixed: "left",
        render: (text) => (
          <Tag color="geekblue" style={{ fontSize: 14, fontWeight: 700 }}>
            {text}
          </Tag>
        ),
      },
      {
        title: "Tên Bệnh Nhân",
        dataIndex: "TenBenhNhan",
        width: 180,
        ellipsis: true,
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Đối tượng",
        dataIndex: "LoaiBenhNhan",
        width: 100,
        align: "center",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Tình trạng",
        dataIndex: "TinhTrang",
        width: 100,
        align: "center",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Nội dung đơn",
        dataIndex: "NoiDungChiTiet",
        width: 320,
        ellipsis: true,
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "TG lấy số",
        dataIndex: "NgayGioLaySo",
        width: 170,
        align: "center",
        render: (t) => <span>{t || "-"}</span>,
      },
      {
        title: "TG thực hiện",
        dataIndex: "NgayGioThucHien",
        width: 170,
        align: "center",
        render: (t) => <span>{t || "-"}</span>,
      },
      {
        title: "Tuổi",
        dataIndex: "Tuoi",
        width: 60,
        align: "center",
      },
      {
        title: "#",
        width: 60,
        align: "center",
        fixed: "right",
        render: (_, record) => (
          <Tooltip title="Gọi lại">
            <Popconfirm
              placement="left"
              title="Gọi lại?"
              onConfirm={() => actions.handleGoiLai(record)}
            >
              <Button
                size="small"
                type="primary"
                ghost
                icon={<RedoOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        ),
      },
    ],
    [actions],
  );

  if (loadingInit) {
    return <></>;
  }

  return (
    <div className="nhathuoc-goi-benh-wrapper">
      <Row gutter={[12, 12]} style={{ height: "100%" }}>
        <Col xs={24} md={8} lg={6} style={{ height: "100%" }}>
          <div className="left-panel-container">
            <DoctorInfoCard
              info={info}
              phongBan={selectedPhongBan}
              hangDoi={selectedHangDoi}
              phongBanList={modulePhongBanList}
              hangDoiList={moduleHangDoiList}
              onPhongBanChange={setSelectedPhongBan}
              onHangDoiChange={setSelectedHangDoi}
              moduleLabel="Nhà thuốc"
            />

            <Card title="" size="small">
              <div style={{ marginBottom: 8 }}>
                <Text strong>Mã phiếu/đơn:</Text>
                <ScanInput
                  onSubmit={actions.handleInsertVP}
                  style={{ width: "100%" }}
                />
              </div>
            </Card>

            <CurrentPatientCard
              patient={benhNhanMoi}
              onCallNext={actions.handleGoiBn}
            />
            <DeviceCard initDevices={initDevices} />
          </div>
        </Col>

        <Col xs={24} md={24} lg={18} style={{ height: "100%" }}>
          <QueueLists
            dsHangCho={dsHangCho}
            dsDaGoi={dsDaGoi}
            onSkip={actions.handleBoQua}
            onRecall={actions.handleGoiLai}
            columnsCho={columnsCho}
            columnsDaGoi={columnsDaGoi}
            layout="vertical"
          />
        </Col>
      </Row>
    </div>
  );
};

export default NhaThuocGoiBenh;
