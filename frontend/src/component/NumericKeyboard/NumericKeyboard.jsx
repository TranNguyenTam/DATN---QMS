import React from "react";
import { Button } from "antd";
import "./NumericKeyboard.scss";

const NumericKeyboard = ({ onInput, onClose }) => {
  const handle = (val) => {
    if (val === "Xóa") return onInput("backspace");
    if (val === "Enter") return onInput("enter");
    if (val === "Thoát") return onClose();
    onInput(val);
  };

  return (
    <div className="kiosk-keyboard">
      <div className="grid">

        <Button onClick={() => handle("1")}>1</Button>
        <Button onClick={() => handle("2")}>2</Button>
        <Button onClick={() => handle("3")}>3</Button>
        <Button className="danger" onClick={() => handle("Xóa")}>Xóa</Button>

        <Button onClick={() => handle("4")}>4</Button>
        <Button onClick={() => handle("5")}>5</Button>
        <Button onClick={() => handle("6")}>6</Button>

        {/* Nút Thoát chiếm 2 hàng */}
        <Button className="exit" onClick={() => handle("Thoát")}>Thoát</Button>

        <Button onClick={() => handle("7")}>7</Button>
        <Button onClick={() => handle("8")}>8</Button>
        <Button onClick={() => handle("9")}>9</Button>

        {/* Hàng cuối */}
        <Button className="zero" onClick={() => handle("0")}>0</Button>
        <Button className="enter" onClick={() => handle("Enter")}>Enter</Button>

      </div>
    </div>
  );
};

export default NumericKeyboard;
