using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Qms.Core.DTOs;
using Qms.Core.Exceptions;
using System;
using System.Collections.Generic;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;

namespace Qms.API.Middlewares;

public class GlobalExceptionMiddleware
{
    private const string GenericServerMessage = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.";

    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (AppException ex)
        {
            // Lỗi phía server (DB / nội bộ / dịch vụ ngoài) ghi log đầy đủ nhưng
            // KHÔNG trả chi tiết ra client để tránh lộ schema/stack.
            if (IsServerError(ex.ErrorCode))
                _logger.LogError(ex, "AppException (server-side): {Code}", ex.ErrorCode);
            await HandleAppExceptionAsync(context, ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Uncategorized error");
            await HandleExceptionAsync(context, ex);
        }
    }

    private static bool IsServerError(ErrorCode code) => code is
        ErrorCode.DATABASE_ERROR or
        ErrorCode.INTERNAL_ERROR or
        ErrorCode.EXTERNAL_SERVICE_ERROR or
        ErrorCode.SERVICE_UNAVAILABLE or
        ErrorCode.UNCATEGORIZED;

    private static Task HandleAppExceptionAsync(HttpContext context, AppException exception)
    {
        context.Response.ContentType = "application/json";

        var statusMap = new Dictionary<ErrorCode, HttpStatusCode>
        {
            { ErrorCode.NOT_FOUND, HttpStatusCode.NotFound },
            { ErrorCode.ALREADY_EXISTS, HttpStatusCode.Conflict },
            { ErrorCode.INVALID_ID, HttpStatusCode.BadRequest },
            { ErrorCode.UNAUTHORIZED, HttpStatusCode.Unauthorized },
            { ErrorCode.FORBIDDEN, HttpStatusCode.Forbidden },
            { ErrorCode.VALIDATION_ERROR, HttpStatusCode.BadRequest },
            { ErrorCode.INVALID_FORMAT, HttpStatusCode.BadRequest },
            { ErrorCode.BUSINESS_RULE_VIOLATION, HttpStatusCode.BadRequest },
            { ErrorCode.INTERNAL_ERROR, HttpStatusCode.InternalServerError },
            { ErrorCode.EXTERNAL_SERVICE_ERROR, HttpStatusCode.BadGateway },
            { ErrorCode.DATABASE_ERROR, HttpStatusCode.InternalServerError },
            { ErrorCode.SERVICE_UNAVAILABLE, HttpStatusCode.ServiceUnavailable },
            { ErrorCode.UNCATEGORIZED, HttpStatusCode.InternalServerError },
        };

        var statusCode = statusMap.TryGetValue(exception.ErrorCode, out var code)
            ? code
            : HttpStatusCode.InternalServerError;

        context.Response.StatusCode = (int)statusCode;

        // Lỗi nghiệp vụ (NOT_FOUND, VALIDATION...) giữ message tiếng Việt thân thiện;
        // lỗi server thì che bằng message chung.
        var clientMessage = IsServerError(exception.ErrorCode)
            ? GenericServerMessage
            : exception.Message;

        var response = new ErrorResponseApi(exception.ErrorCode, clientMessage)
        {
            Path = context.Request.Path
        };

        return context.Response.WriteAsync(JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

        // KHÔNG trả exception.Message (có thể lộ chi tiết nội bộ) — đã log ở InvokeAsync.
        var response = new ErrorResponseApi(ErrorCode.UNCATEGORIZED, GenericServerMessage)
        {
            Path = context.Request.Path
        };

        return context.Response.WriteAsync(JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
    }
}
