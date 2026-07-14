import Time from "../Time";
import "./TiviFooter.scss";

function TiviFooter({ marqueeText }) {
  return (
    <div className="tivi-footer">
      <div className="time-box">
        <Time />
      </div>
      <div className="marquee-box">
        <div className="marquee-text">{marqueeText}</div>
      </div>
    </div>
  );
}

export default TiviFooter;
