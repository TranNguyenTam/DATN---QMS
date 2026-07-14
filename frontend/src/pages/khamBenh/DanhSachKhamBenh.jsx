import {
  OrderedListOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
    Button,
    Card,
    Input,
    Skeleton,
    Table,
    Tag,
    Typography,
    message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../component/PageHeader";
import http from "../../util/httpClient";

const { Text } = Typography;

function DanhSachKhamBenh() {
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await http.get("/kham-benh/danh-sach-benh-nhan");
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      message.error(error?.message || "Không tải được danh sách khám bệnh");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((row) =>
      Object.values(row || {}).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(text),
      ),
    );
  }, [rows, keyword]);

  const columns = useMemo(() => {
    if (!rows.length) {
      return [];
    }

    return Object.keys(rows[0]).map((key) => ({
      title: key,
      dataIndex: key,
      key,
      ellipsis: true,
      width: 180,
      render: (value) => {
        if (
          key.toLowerCase().includes("trangthai") ||
          key.toLowerCase().includes("tinhtrang")
        ) {
          const text = String(value ?? "");
          const color = text.toLowerCase().includes("da") ? "green" : "blue";
          return <Tag color={color}>{text || "-"}</Tag>;
        }
        return <span>{String(value ?? "-")}</span>;
      },
    }));
  }, [rows]);

  const getRowKey = (record) =>
    String(
      record?.HangDoiPhongBan_Id ||
        record?.BenhNhan_Id ||
        record?.ID ||
        record?.STT ||
        record?.SoPhieuYeuCau ||
        record?.MaYTe ||
        JSON.stringify(record),
    );

  return (
    <div style={{ padding: 16, height: "100%", boxSizing: "border-box" }}>
      <PageHeader
        icon={<OrderedListOutlined />}
        title="Danh sách khám bệnh"
        subtitle="Danh sách bệnh nhân trong queue Khám bệnh hôm nay"
        extra={
          <>
            <Input
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo mã, tên, trạng thái..."
              prefix={<SearchOutlined />}
              style={{ width: 320 }}
            />
            <PageHeader.Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
            >
              Tải lại
            </PageHeader.Button>
          </>
        }
      />
      <Card
        style={{ height: "100%" }}
        styles={{
          body: {
            height: "calc(100% - 56px)",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Text type="secondary" style={{ marginBottom: 12 }}>
          Tổng số: {filteredRows.length}
        </Text>

        {loading && rows.length === 0 ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table
            bordered
            loading={loading}
            dataSource={filteredRows}
            columns={columns}
            rowKey={getRowKey}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            scroll={{ x: "max-content", y: "calc(100vh - 270px)" }}
            locale={{ emptyText: "Chưa có dữ liệu" }}
          />
        )}
      </Card>
    </div>
  );
}

export default DanhSachKhamBenh;
