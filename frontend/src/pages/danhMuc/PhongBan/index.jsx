import React, { useState, useEffect } from "react";
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
  ApartmentOutlined,
} from "@ant-design/icons";
import "./PhongBan.scss";
import http from "../../../util/httpClient";
import PageHeader from "../../../component/PageHeader";

const PhongBan = () => {
  const [form] = Form.useForm();
  const [data, setData] = useState([]);
  const [loaiPhongBanOptions, setLoaiPhongBanOptions] = useState([]);
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
      const [phongBanRes, LoaiPhongBanRes] = await Promise.all([
        http.get("/danh-muc/phong-ban"),
        http.get("/danh-muc/phong-ban/loai-phong-ban"),
      ]);
      setData(phongBanRes?.data || []);
      setLoaiPhongBanOptions(LoaiPhongBanRes?.data || []);
    } catch (error) {
      message.error("Lỗi tải dữ liệu: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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
      const selectedRow = data.find((item) => item.PhongBan_Id === selectedId);
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
        const delRes = await http.del("/danh-muc/phong-ban/" + selectedId);
        if(delRes){
          message.success("Xóa phòng ban thành công!");
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
      if (action === "ADD") {
        const createRes = await http.post(
          "/danh-muc/phong-ban/create",
          payload
        );
        if (createRes && createRes.data.length > 0) {
          message.success(`Đã thêm thành công ${payload.TenPhongBan}`);
          loadData();
          setAction(null);
          setIsEditing(false);
        } else {
          message.error("Có lỗi khi thêm mới phòng ban");
        }
      } else if (action === "EDIT") {
        const updateRes = await http.put("/danh-muc/phong-ban/update", payload);

        if (updateRes && updateRes.data.length > 0) {
          message.success(`Đã sửa thành công ${payload.TenPhongBanDayDu}`);
          loadData();
          setAction(null);
          setIsEditing(false);
        } else {
          message.error("Có lỗi khi cập nhật phòng ban");
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

    setSelectedId(record.PhongBan_Id);
    if (!isEditing) {
      fillForm(record);
    }
  };

  const fillForm = (record) => {
    form.setFieldsValue({
      PhongBan_Id: record.PhongBan_Id,
      TenPhongBan: record.TenPhongBan,
      TenPhongBanDayDu: record.TenPhongBanDayDu,
      LoaiPhongBan: record.LoaiPhongBan,
      STTPhongBan: record.STTPhongBan,
      MoTa: record.MoTa,
      TamNgung: record.TamNgung === "Đang Hoạt Động" ? false : true,
      TenFile: record.TenFile,
    });
    // setSoundId(record.Sound_Id_PhongBan);
  };

  const columns = [
    {
      title: "Tên Phòng Ban",
      dataIndex: "TenPhongBan",
      key: "TenPhongBan",
      width: 150,
    },
    {
      title: "Tên đầy đủ",
      dataIndex: "TenPhongBanDayDu",
      key: "TenPhongBanDayDu",
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
      dataIndex: "STTPhongBan",
      key: "STTPhongBan",
      width: 110,
    },
    {
      title: "Loại hàng đợi",
      dataIndex: "LoaiPhongBan",
      key: "LoaiPhongBan",
      render: (id) =>
        loaiPhongBanOptions.find((x) => x.FieldCode === id)?.FieldName || id,
      width: 150,
    },
    { title: "Mô tả", dataIndex: "MoTa", key: "MoTa" },
    { title: "Tên File", dataIndex: "TenFile", key: "TenFile" },
  ];

  return (
    <div className="danh-muc-phong-ban">
      <PageHeader
        icon={<ApartmentOutlined />}
        title="Danh mục phòng ban"
        subtitle="Quản lý phòng ban / quầy phục vụ."
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
          <Form.Item name="PhongBan_Id" label="Mã Phòng Ban" hidden>
            <Input readOnly />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="TenPhongBan"
                label="Tên Phòng ban"
                rules={[{ required: true, message: "Không được để trống!" }]}
              >
                <Input placeholder="Nhập tên phòng ban..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="STTPhongBan" label="Mã ký tự đầu STT">
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
                name="TenPhongBanDayDu"
                label="Tên Phòng ban đầy đủ"
                rules={[{ required: true, message: "Không được để trống!" }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="LoaiPhongBan"
                label="Loại phòng ban"
                rules={[{ required: true, message: "Chọn loại phòng ban!" }]}
              >
                <Select placeholder="Chọn loại...">
                  {loaiPhongBanOptions.map((item) => (
                    <Select.Option key={item.FieldCode} value={item.FieldCode}>
                      {item.FieldName}
                    </Select.Option>
                  ))}
                </Select>
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

          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="MoTa" label="Mô tả">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>

      {/* --- GRID / TABLE --- */}
      <div className="grid-container">
        <Table
          rowKey="PhongBan_Id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 1100, y: "40vh" }}
          rowClassName={(record) =>
            record.PhongBan_Id === selectedId ? "ant-table-row-selected" : ""
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

export default PhongBan;
