import React, { useState, useEffect, use } from "react";
import {
  Table,
  Button,
  Form,
  Input,
  Select,
  Checkbox,
  message,
  Modal,
  Row,
  Col,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  DeleteOutlined,
  LogoutOutlined,
  SoundOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import "./HangDoi.scss";
import http from "../../../util/httpClient";
import PageHeader from "../../../component/PageHeader";

const HangDoi = () => {
  const [form] = Form.useForm();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Trạng thái điều khiển (State Machine giống WinForm)
  const [isEditing, setIsEditing] = useState(false); // Enable/Disable form inputs
  const [action, setAction] = useState(null); // 'ADD' | 'EDIT' | null
  const [selectedId, setSelectedId] = useState(null);

  //   const [soundId, setSoundId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const hangDoiRes = await http.get("/danh-muc/hang-doi");
      setData(hangDoiRes?.data || []);
    } catch (error) {
      message.error("Lỗi tải dữ liệu hàng đợi!");
    } finally {
      setLoading(false);
    }
  };
  console.log(data);

  // 2. Xử lý các nút Toolbar
  const handleThem = () => {
    setAction("ADD");
    setIsEditing(true);
    setSelectedId(null);
    // setSoundId(null);
    form.resetFields();
  };

  const handleSua = () => {
    if (!selectedId) {
      message.warning("Vui lòng chọn dòng cần sửa!");
      return;
    }
    setAction("EDIT");
    setIsEditing(true);
  };

  const handleHuy = () => {
    setAction(null);
    setIsEditing(false);
    form.resetFields();

    // Nếu đang chọn dòng nào đó thì fill lại dữ liệu dòng đó
    if (selectedId) {
      const selectedRow = data.find((item) => item.HangDoi_Id === selectedId);
      if (selectedRow) fillForm(selectedRow);
    }
  };

  const handleXoa = () => {
    if (!selectedId) return;

    Modal.confirm({
      title: "Thông báo",
      content: "Bạn có đồng ý xóa?",
      okText: "Có",
      cancelText: "Không",
      onOk: async () => {
        const delRes = await http.del("/danh-muc/hang-doi/" + selectedId);
        if (delRes) {
          message.success("Xóa hàng đợi thành công!");
          loadData();
          handleHuy();
          setSelectedId(null);
        }
      },
    });
  };

  const handleLuu = async () => {
    try {
      const values = await form.validateFields();

      const payload = {
        ...values,
        TamNgung: values.TamNgung ? 1 : 0,
        // Sound_Id_PhongBan: soundId,
      };
      console.log(payload);
      
      if (action === "ADD") {
        const createRes = await http.post(
          "/danh-muc/hang-doi/create",
          payload
        );
        console.log(createRes);
        
        if (createRes && createRes.data.length > 0) {
          message.success(`Đã thêm thành công ${payload.TenHangDoi}`);
          loadData();
          setAction(null);
          setIsEditing(false);
        } else {
          message.error("Có lỗi khi thêm mới hàng đợi");
        }
      } else if (action === "EDIT") {
        const updateRes = await http.put("/danh-muc/hang-doi/update", payload);

        if (updateRes && updateRes.data.length > 0) {
          message.success(`Đã sửa thành công ${payload.TenHangDoi}`);
          loadData();
          setAction(null);
          setIsEditing(false);
        } else {
          message.error("Có lỗi khi cập nhật hàng đợi");
        }
      }
    } catch (errorInfo) {
      message.error(errorInfo?.message || "Có lỗi khi lưu dữ liệu!");
    }
  };

  //   const handleLayDuLieuAmThanh = () => {
  //     const tenDayDu = form.getFieldValue("TenPhongBanDayDu");
  //     if (!tenDayDu) {
  //       message.error("Chưa có tên đầy đủ để tạo âm thanh!");
  //       return;
  //     }

  //     // Giả lập gọi API Model.API.postVoice
  //     message.loading({
  //       content: "Đang tạo file âm thanh...",
  //       key: "audio_process",
  //     });

  //     setTimeout(() => {
  //       // Giả lập kết quả trả về từ server
  //       const fakeFileName = `Voice-${Date.now()}.wav`;
  //       const fakeSoundId = "SOUND_999";

  //       form.setFieldsValue({ TenFile: fakeFileName });
  //       setSoundId(fakeSoundId);

  //       message.success({
  //         content: "Lấy dữ liệu âm thanh thành công!",
  //         key: "audio_process",
  //       });
  //     }, 1500);
  //   };

  const onRowClick = (record) => {
    // Nếu đang ở chế độ thêm/sửa thì không được chọn row khác
    if (isEditing && action === "ADD") return;

    setSelectedId(record.HangDoi_Id);
    if (!isEditing) {
      fillForm(record);
    }
  };

  const fillForm = (record) => {
    form.setFieldsValue({
      HangDoi_Id: record.HangDoi_Id,
      MaHangDoi: record.MaHangDoi,
      TenHangDoi: record.TenHangDoi,
      KyTuSTT: record.KyTuSTT,
      TamNgung: record.TamNgung === "Đang Hoạt Động" ? false : true,
    });
    // setSoundId(record.Sound_Id_PhongBan);
  };

  const columns = [
    {
      title: "Mã hàng đợi",
      dataIndex: "MaHangDoi",
      key: "MaHangDoi",
      width: 150,
    },
    {
      title: "Tên hàng đợi",
      dataIndex: "TenHangDoi",
      key: "TenHangDoi",
      width: 200,
    },
    {
      title: "Tạm ngưng",
      dataIndex: "TamNgung",
      key: "TamNgung",
      width: 150,
    },
    {
      title: "Ký tự đầu STT",
      dataIndex: "KyTuSTT",
      key: "KyTuSTT",
      width: 110,
    },
    { title: "Tên File", dataIndex: "TenFile", key: "TenFile" },
  ];

  return (
    <div className="danh-muc-hang-doi">
      <PageHeader
        icon={<UnorderedListOutlined />}
        title="Danh mục hàng đợi"
        subtitle="Quản lý danh sách hàng đợi của hệ thống."
      />
      <div className="toolbar">
        <Button
          icon={<PlusOutlined />}
          onClick={handleThem}
          disabled={isEditing}
          type="primary"
          ghost
        >
          Thêm mới
        </Button>
        <Button
          icon={<EditOutlined />}
          onClick={handleSua}
          disabled={isEditing || !selectedId}
        >
          Sửa
        </Button>
        <Button
          icon={<SaveOutlined />}
          className="btn-save"
          onClick={handleLuu}
          disabled={!isEditing}
        >
          Lưu
        </Button>
        <Button
          icon={<CloseOutlined />}
          onClick={handleHuy}
          disabled={!isEditing}
        >
          Hủy
        </Button>
        <Button
          icon={<DeleteOutlined />}
          className="btn-delete"
          onClick={handleXoa}
          disabled={isEditing || !selectedId}
        >
          Xóa
        </Button>
      </div>

      {/* --- INPUT FORM --- */}
      <div className="form-container">
        <Form
          form={form}
          layout="vertical"
          disabled={!isEditing} // Disable toàn bộ form khi không phải mode Add/Edit
        >
          <Form.Item name="HangDoi_Id" label="HangDoi_Id" hidden>
            <Input readOnly />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="MaHangDoi"
                label="Mã hàng đợi"
                rules={[{ required: true, message: "Không được để trống!" }]}
              >
                <Input placeholder="Nhập mã hàng đợi..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="KyTuSTT" label="Mã ký tự đầu STT">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8} style={{ paddingTop: "30px" }}>
              <Form.Item name="TamNgung" valuePropName="checked">
                <Checkbox>Tạm Ngưng</Checkbox>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="TenHangDoi"
                label="Tên hàng đợi"
                rules={[{ required: true, message: "Không được để trống!" }]}
              >
                <Input />
              </Form.Item>
            </Col>
            {/* <Col span={8}>
              <Form.Item label="File Âm thanh">
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    type="primary"
                    icon={<SoundOutlined />}
                    onClick={handleLayDuLieuAmThanh}
                    disabled={!isEditing} // Button này chỉ active khi đang Edit/Add
                  >
                    Lấy dữ liệu
                  </Button>
                  <Form.Item name="TenFile" noStyle>
                    <Input
                      readOnly
                      style={{ flex: 1 }}
                      placeholder="Tên file..."
                    />
                  </Form.Item>
                </div>
              </Form.Item>
            </Col> */}
          </Row>
        </Form>
      </div>

      {/* --- GRID / TABLE --- */}
      <div className="grid-container">
        <Table
          rowKey="HangDoi_Id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 1100, y: "40vh" }}
          rowClassName={(record) =>
            record.HangDoi_Id === selectedId ? "ant-table-row-selected" : ""
          }
          onRow={(record) => ({
            onClick: () => onRowClick(record),
          })}
          size="small"
          bordered
        />
      </div>
    </div>
  );
};

export default HangDoi;
