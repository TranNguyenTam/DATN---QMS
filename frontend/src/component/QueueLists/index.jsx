import { CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Table } from "antd";
import "./QueueLists.scss";

const QueueLists = ({
  dsHangCho,
  dsDaGoi,
  columnsCho,
  columnsDaGoi,
  layout = "horizontal",
  loading = false,
}) => {
  return (
    <div style={{ height: "calc(100vh - 100px)", padding: "10px" }}>
      <div className={`queue-lists-split-view ${layout}`}>
        {/* Cột Đang Chờ */}
        <div className="split-col waiting-col">
          <div className="col-header">
            <ClockCircleOutlined />
            ĐANG CHỜ
            <span className="count-badge">{dsHangCho?.length || 0}</span>
          </div>
          <div className="col-body">
            <Table
              dataSource={dsHangCho}
              columns={columnsCho}
              rowKey="HangDoiPhongBan_Id"
              pagination={false}
              size="small"
              scroll={{ y: "auto" }}
              loading={loading}
            />
          </div>
        </div>

        <div className="split-col history-col">
          <div className="col-header">
            <CheckCircleOutlined />
            ĐÃ GỌI
            <span className="count-badge">{dsDaGoi?.length || 0}</span>
          </div>
          <div className="col-body">
            <Table
              dataSource={dsDaGoi}
              columns={columnsDaGoi}
              rowKey="HangDoiPhongBan_Id"
              pagination={false}
              size="small"
              scroll={{ y: "auto" }}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
export default QueueLists;
