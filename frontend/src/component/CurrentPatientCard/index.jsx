import { SoundOutlined, SwapOutlined } from "@ant-design/icons";
import { Button, Card, Empty } from "antd";

import "./CurrentPatientCard.scss";

const CurrentPatientCard = ({
  patient,
  onCallNext,
  onOpenTransfer,
  noiChuyen,
}) => {
  return (
    <Card className="call-card" variant="borderless">
      <div className="call-display">
        <div className="calling-label">
          <SoundOutlined />
          ĐANG GỌI
        </div>
        {patient ? (
          <>
            <div className="current-stt">{patient.STT || "---"}</div>
            <div className="current-name">
              {patient.TENBENHNHAN || patient.TenBenhNhan || "N/A"}
            </div>
            {noiChuyen && (
              <Button
                style={{ marginTop: 8 }}
                icon={<SwapOutlined />}
                type="default"
                onClick={onOpenTransfer}
              >
                Chuyển sang quầy khác
              </Button>
            )}
          </>
        ) : (
          <Empty
            description="Chưa gọi bệnh nhân nào"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginBottom: 12 }}
          />
        )}

        <Button
          type="primary"
          size="large"
          icon={<SoundOutlined />}
          block
          className="btn-call-big"
          onClick={onCallNext}
        >
          GỌI SỐ TIẾP THEO
        </Button>
      </div>
    </Card>
  );
};

export default CurrentPatientCard;
