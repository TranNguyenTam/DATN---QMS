using System.Text.Json.Serialization;

namespace Qms.Core.DTOs;

public class UpdatePhongBanReq
{
    // FE gửi key "PhongBan_Id" (theo row DM_PhongBan) — map cho khớp.
    [JsonPropertyName("PhongBan_Id")]
    public int PhongBanId { get; set; }
    public string TenPhongBan { get; set; } = string.Empty;
    public string TenPhongBanDayDu { get; set; } = string.Empty;
    // STTPhongBan (mã ký tự đầu STT) — FE gửi "STTPhongBan", khớp case-insensitive.
    [JsonPropertyName("STTPhongBan")]
    public string? SttPhongBan { get; set; }
    // Id loại phòng ban (số), không phải string → tránh lỗi bind JSON.
    public int LoaiPhongBan { get; set; }
    public int TamNgung { get; set; }
    public string? MoTa { get; set; }
}

public class UpdateHangDoiReq
{
    public int HangDoiId { get; set; }
    public string MaHangDoi { get; set; } = string.Empty;
    public string TenHangDoi { get; set; } = string.Empty;
    public string? KyTuSTT { get; set; }
    public int TamNgung { get; set; }
}

public class TtsRequest
{
    public string Text { get; set; } = string.Empty;
}

public class DeviceInfo
{
    public string? SessionId { get; set; }
    public string? DeviceName { get; set; }
    public string? DeviceType { get; set; }
    public string? Status { get; set; }
    public long LastSeen { get; set; }
}

public class BoQuaRequest
{
    public int HangDoiPhongBanId { get; set; }
    public int PhongBanId { get; set; }
    public int? HangDoiId { get; set; }
}
