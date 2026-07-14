using System;
using System.Collections.Generic;

namespace Qms.Core.DTOs;

// ─── Bệnh nhân (HIS-light) ──────────────────────────────────────────

public class BenhNhanCreateReq
{
    public string HoTen { get; set; } = string.Empty;
    /// <summary>1 = Nam, 2 = Nữ, 3 = Khác (theo eHospital GIOITINH int).</summary>
    public int? GioiTinh { get; set; }
    public int? NamSinh { get; set; }
    public DateTime? NgaySinh { get; set; }
    public string? CCCD { get; set; }
    public string? SoDienThoai { get; set; }
    public string? MaDanToc { get; set; }
    public string? MaNgheNghiep { get; set; }
    public string? NhomMau { get; set; }
    public string? MaTinh { get; set; }
    public string? MaXa { get; set; }
    public string? DiaChi { get; set; }
    public string? Email { get; set; }
}

// ─── BHYT ──────────────────────────────────────────────────────────

public class BhytInfo
{
    public string? SoBHYT { get; set; }
    public DateTime? NgayBatDau { get; set; }
    public DateTime? NgayKetThuc { get; set; }
    /// <summary>Mã đối tượng (DM_DoiTuong.Ma — vd "BH80", "BH100", "DV"…).</summary>
    public string? MaQuyenLoi { get; set; }
}

// ─── Tiếp nhận (đầy đủ — tạo BN mới nếu chưa có) ───────────────────

public class TiepNhanCreateReq
{
    /// <summary>Nếu null thì backend dùng <see cref="BenhNhan"/> để tạo BN mới.</summary>
    public int? BenhNhanId { get; set; }
    public BenhNhanCreateReq? BenhNhan { get; set; }
    public BhytInfo? Bhyt { get; set; }
    /// <summary>Mã DM_DoiTuong (vd "BH80"). Mặc định "DV".</summary>
    public string? DoiTuongId { get; set; }
    public string? LyDoKham { get; set; }
    public string? BacSiChiDinh { get; set; }
    /// <summary>PhongBan đón tiếp (NOITIEPNHAN_ID).</summary>
    public int NoiTiepNhanId { get; set; }
}

// ─── Chỉ định CLS ──────────────────────────────────────────────────

public class ChiDinhDichVuItem
{
    public int DichVuId { get; set; }
    public string? MaDichVu { get; set; }
    public string? TenDichVu { get; set; }
    public int SoLuong { get; set; } = 1;
    public decimal? DonGia { get; set; }
}

public class ChiDinhClsReq
{
    public int TiepNhanId { get; set; }
    public int BenhNhanId { get; set; }
    public List<ChiDinhDichVuItem> DichVu { get; set; } = new();
}

// ─── Pha 6: Quản lý bệnh nhân (list + detail + history + update + soft delete) ──

/// <summary>Một dòng trong danh sách BN (đã gộp BHYT mới nhất).</summary>
public class BenhNhanListItem
{
    public int BenhNhanId { get; set; }
    public string? MaYTe { get; set; }
    public string? TenBenhNhan { get; set; }
    public int? GioiTinh { get; set; }
    public string? GioiTinhText { get; set; }
    public DateTime? NgaySinh { get; set; }
    public int? NamSinh { get; set; }
    public string? SoDienThoai { get; set; }
    public string? CMND { get; set; }
    public string? DiaChi { get; set; }
    public string? DiaChiThuongTru { get; set; }
    public string? Email { get; set; }
    public DateTime? NgayTao { get; set; }
    // BHYT mới nhất (có thể null)
    public int? BhytId { get; set; }
    public string? SoBHYT { get; set; }
    public int? LoaiBhyt { get; set; }
    public string? MaDoiTuong { get; set; }
    public string? TenDoiTuong { get; set; }
    public DateTime? BhytTuNgay { get; set; }
    public DateTime? BhytDenNgay { get; set; }
}

/// <summary>Wrapper kết quả paged.</summary>
public class PagedResult<T>
{
    public IEnumerable<T> Items { get; set; } = Array.Empty<T>();
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

/// <summary>Chi tiết BN — full info + BHYT mới nhất.</summary>
public class BenhNhanDetail : BenhNhanListItem
{
    public string? MaDanToc { get; set; }
    public string? MaNgheNghiep { get; set; }
    public string? NhomMau { get; set; }
    public string? MaTinh { get; set; }
    public string? MaXa { get; set; }
    public decimal? TyLeBhyt { get; set; }
}

/// <summary>Lịch sử tiếp nhận của 1 BN.</summary>
public class TiepNhanHistoryItem
{
    public int TiepNhanId { get; set; }
    public string? SoTiepNhan { get; set; }
    public DateTime? NgayTiepNhan { get; set; }
    public string? DoiTuongId { get; set; }
    public string? TenDoiTuong { get; set; }
    public int? NoiTiepNhanId { get; set; }
    public string? TenPhongBan { get; set; }
    public string? LyDoKham { get; set; }
    public string? BacSiChiDinh { get; set; }
    public string? TrangThai { get; set; }
}

/// <summary>Request update BN — info + BHYT (atomic).</summary>
public class BenhNhanUpdateReq
{
    public BenhNhanCreateReq BenhNhan { get; set; } = new();
    public BhytInfo? Bhyt { get; set; }
}
