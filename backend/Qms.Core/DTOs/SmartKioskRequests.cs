namespace Qms.Core.DTOs;

public class WaitEstimateRequest
{
    public int HangDoiId { get; set; }
    public int PriorityWeight { get; set; } = 1;
}

public class FaceCheckInRequest
{
    public int HangDoiId { get; set; }
    public int UuTien { get; set; } = 0;
    public string? LoaiUuTien { get; set; }
    public int PriorityWeight { get; set; } = 1;
    public string? ManualPatientCode { get; set; }
}
