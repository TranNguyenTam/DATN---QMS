import { useMemo, useState } from "react";
import { Row, Col, message, Card, Spin, Tag, Space, Tooltip, Popconfirm, Button } from "antd";
import "./QuanLyKhamBenh.scss";

// Hooks
import { useQueueLogicKB } from "../../../hooks/useQueueLogicKB";

// Components
import CurrentPatientCard from "../../../component/CurrentPatientCard";
import DoctorInfoCard from "../../../component/DoctorInfoCard";
import QueueLists from "../../../component/QueueLists";
import DeviceCard from "../../../component/DeviceCard";

import { RedoOutlined, StepForwardOutlined } from "@ant-design/icons";

import { useWindowSize } from "../../../hooks/useWindownSize";

const QuanLyKhamBenh = () => {
  const { width } = useWindowSize();
  // Logic & Data
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
  } = useQueueLogicKB();

  // Local State
  const [tenBacSi, setTenBacSi] = useState(
    () => localStorage.getItem("tenBacSi") || ""
  );

  const columnsCho = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "SoThuTuDayDu",
        width: 70,
        align: "center",
        render: (text) => (
          <Tag color="blue" style={{ fontSize: 14, fontWeight: "bold" }}>
            {text}
          </Tag>
        ),
      },
      {
        title: "Tên Bệnh Nhân",
        dataIndex: "TenBenhNhan",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "Tuổi",
        width: 50,
        align: "center",
        dataIndex: "Tuoi",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "#",
        width: 50,
        align: "center",
        render: (_, record) => (
          <Space size="small">
            <Tooltip title="Bỏ qua">
              {/* Sử dụng actions.handleBoQua trực tiếp từ hook */}
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
          </Space>
        ),
      },
    ],
    [actions] // Dependency là actions để đảm bảo hàm không bị cũ
  );

  // 2. Cột Đã gọi
  const columnsDaGoi = useMemo(
    () => [
      {
        title: "STT",
        dataIndex: "SoThuTuDayDu",
        width: 70,
        align: "center",
        render: (text) => <Tag color="#555">{text}</Tag>,
      },
      {
        title: "Tên Bệnh Nhân",
        dataIndex: "TenBenhNhan",
        render: (text, record) => (
          <div style={{ lineHeight: "1.2" }}>
            <div style={{ fontWeight: 500 }}>{text || "N/A"}</div>
            <div
              style={{
                fontSize: 11,
                fontStyle: "italic",
                color: record.TinhTrang === "Đã qua lượt" ? "red" : "green",
              }}
            >
              {record.TinhTrang}
            </div>
          </div>
        ),
      },
      {
        title: "Tuổi",
        width: 50,
        align: "center",
        dataIndex: "Tuoi",
        render: (t) => <span>{t || "N/A"}</span>,
      },
      {
        title: "#",
        width: 50,
        align: "center",
        render: (_, record) => (
          <Space size="small">
            <Tooltip title="Gọi lại">
              {/* Sử dụng actions.handleGoiLai trực tiếp từ hook */}
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
          </Space>
        ),
      },
    ],
    [actions]
  );

  
  // Local Handlers
  const handleSaveTenBacSi = () => {
    localStorage.setItem("tenBacSi", tenBacSi);
    message.success("Đã lưu tên bác sĩ.");
  };

  // Việc chuyển BN sang Viện phí / Nhà thuốc đã chuyển sang trang
  // "Bệnh án + Chỉ định" (nút "Chuyển tiếp" + modal sau khi lưu bệnh án) —
  // gắn với bước ghi lâm sàng, đúng thời điểm BN khám xong. Màn này chỉ
  // còn gọi số. (Nút "Chuyển sang quầy khác" + TransferModal đã gỡ.)

  if (loadingInit) {
    return <></>;
  }

  return (
    <div className="kham-benh-wrapper">
      <Row gutter={[12, 12]} style={{ height: "100%" }}>
        {/* === LEFT PANEL === */}
        <Col xs={24} md={24} lg={6} style={{ height: "100%" }}>
          <div className="left-panel-container">
            <DoctorInfoCard
              info={info}
              phongBan={selectedPhongBan}
              hangDoi={selectedHangDoi}
              phongBanList={modulePhongBanList}
              hangDoiList={moduleHangDoiList}
              onPhongBanChange={setSelectedPhongBan}
              onHangDoiChange={setSelectedHangDoi}
              moduleLabel="Khám bệnh"
              tenBacSi={tenBacSi}
              setTenBacSi={setTenBacSi}
              onSave={handleSaveTenBacSi}
              hasTenBacSi={true}
            />

            <CurrentPatientCard
              patient={benhNhanMoi}
              onCallNext={actions.handleGoiBn}
            />
            <DeviceCard initDevices={initDevices} />
          </div>
        </Col>

        {/* === RIGHT PANEL === */}
        <Col xs={24} md={24} lg={18} style={{ height: "100%" }}>
          <QueueLists
            dsHangCho={dsHangCho}
            dsDaGoi={dsDaGoi}
            onSkip={actions.handleBoQua}
            onRecall={actions.handleGoiLai}
            columnsCho={columnsCho}
            columnsDaGoi={columnsDaGoi}
            layout={width < 1100 ? "vertical" : "horizontal" }
          />
        </Col>
      </Row>
    </div>
  );
};

export default QuanLyKhamBenh;
