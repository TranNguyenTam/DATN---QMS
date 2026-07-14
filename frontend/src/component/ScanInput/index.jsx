import { Input } from "antd";
import { useState } from "react";

export default function ScanInput({ onSubmit ,size, style}) {
  const [value, setValue] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      const code = value.trim();
      if (!code) return;

      onSubmit(code); // gọi BE
      setValue("");
    }
  };

  return (
    <Input
      autoFocus
      placeholder="Quét mã / nhập số phiếu rồi Enter"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      size={size}
      style={style}
    />
  );
}
