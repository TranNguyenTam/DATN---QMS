using System;
using System.Text.Json.Serialization;

namespace Qms.Core.DTOs;

public class ApiResponseDto<T>
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [JsonPropertyName("message")]
    public string? Message { get; set; }
    
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.Now;
    
    [JsonPropertyName("data")]
    public T? Data { get; set; }

    public ApiResponseDto() { }

    public ApiResponseDto(T data)
    {
        Data = data;
    }
}
