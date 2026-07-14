import { Tag } from "antd";
import { useEffect, useState } from "react";

import { Typography } from "antd";
const { Text } = Typography;

function Time(props) {
  const style = { ...props.style };
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <div style={style}>
        {currentTime.toLocaleTimeString("vi-VN")}{" "}
        {currentTime.toLocaleDateString("vi-VN")}
      </div>
    </>
  );
}

export default Time;
