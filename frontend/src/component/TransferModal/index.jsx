import React from "react";
import { Modal, Select } from "antd";

const TransferModal = ({
  open,
  onCancel,
  onOk,
  destinations,
  value,
  onChange,
}) => {
  return (
    <Modal
      title="Chọn nơi cần chuyển bệnh nhân"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
    >
      <Select
        style={{ width: "100%" }}
        placeholder="Chọn nơi chuyển..."
        value={value}
        onChange={onChange}
      >
        {destinations.map((item) => (
          <Select.Option key={item.id} value={item.id}>
            {item.name}
          </Select.Option>
        ))}
      </Select>
    </Modal>
  );
};

export default TransferModal;
