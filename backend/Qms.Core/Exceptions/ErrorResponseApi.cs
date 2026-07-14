using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Qms.Core.Exceptions;

public class ErrorResponseApi
{
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.Now;
    public string? Path { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, string>? Details { get; set; }

    public ErrorResponseApi() { }

    public ErrorResponseApi(ErrorCode errorCode, string? customMessage = null)
    {
        Message = customMessage ?? errorCode.ToString();
    }
}
