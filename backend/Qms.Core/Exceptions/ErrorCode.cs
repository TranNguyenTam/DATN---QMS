namespace Qms.Core.Exceptions;

public enum ErrorCode
{
    // Lỗi chung
    NOT_FOUND,
    ALREADY_EXISTS,
    INVALID_ID,
    UNAUTHORIZED,
    FORBIDDEN,
    VALIDATION_ERROR,
    INVALID_FORMAT,
    BUSINESS_RULE_VIOLATION,

    // Lỗi backend
    INTERNAL_ERROR,
    EXTERNAL_SERVICE_ERROR,
    DATABASE_ERROR,
    SERVICE_UNAVAILABLE,

    // Lỗi không xác định
    UNCATEGORIZED
}
