import img_tiepnhan from "../../assets/images/img_tiepnhan.png";
import "./TiviLeftPanel.scss";

function TiviLeftPanel() {
  return (
    <div className="tivi-left-panel">
      <div className="header-section">
        <div className="logo-box">
          <img src="/logoYHCT.png" alt="Logo" />
        </div>
        <div className="hospital-name">
          <h3>BỆNH VIỆN</h3>
          <h2>Y HỌC CỔ TRUYỀN ĐÀ NẴNG</h2>
        </div>
      </div>
      <div className="video-section">
        <img
          className="video-content"
          src={img_tiepnhan}
          alt="Bệnh viện Y học cổ truyền Đà Nẵng"
        />
      </div>
    </div>
  );
}

export default TiviLeftPanel;
