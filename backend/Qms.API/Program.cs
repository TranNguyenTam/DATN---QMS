using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Qms.API.Hubs;
using Qms.API.Middlewares;
using Qms.API.Services;
using Qms.Infrastructure.Utils;
using Qms.Services.Interfaces;
using Scalar.AspNetCore;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Output: PascalCase — match Java Jackson behavior (FE expects PhongBan, HangDoi, FieldCode...)
        options.JsonSerializerOptions.PropertyNamingPolicy = null;
        // Input: case-insensitive — accept both "username" and "Username" from FE
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    });
builder.Services.AddSignalR();
builder.Services.AddOpenApi();

// Configure Database Helper (Dapper)
builder.Services.AddScoped<IDatabaseHelper, DatabaseHelper>();

// Configure HTTP Clients for external services
builder.Services.AddHttpClient();

// Configure Core Utils
builder.Services.AddSingleton<DeviceRegistry>();
builder.Services.AddSingleton<JwtUtil>();
builder.Services.AddSingleton<CryptUtil>();

// Configure Services
builder.Services.AddScoped<IRoleService, Qms.Services.Implementations.RoleService>();
builder.Services.AddScoped<IAuthService, Qms.Services.Implementations.AuthService>();
builder.Services.AddScoped<IUserInfoService, Qms.Services.Implementations.UserInfoService>();
builder.Services.AddScoped<IViettelTtsService, Qms.Services.Implementations.ViettelTtsService>();
builder.Services.AddScoped<IDanhMucService, Qms.Services.Implementations.DanhMucService>();
builder.Services.AddScoped<ICommonService, Qms.Services.Implementations.CommonService>();
builder.Services.AddScoped<ISocketService, SocketProvider>();
builder.Services.AddScoped<IHangDoiTiepNhanService, Qms.Services.Implementations.HangDoiTiepNhanService>();
builder.Services.AddScoped<IHangDoiPhongBanService, Qms.Services.Implementations.HangDoiPhongBanService>();
// Chặn user thao tác (gọi/bỏ qua/gọi lại) hàng đợi/phòng ban KHÔNG được phân công.
builder.Services.AddScoped<IQueueScopeGuard, QueueScopeGuard>();
builder.Services.AddScoped<ITiepNhanTuDongService, Qms.Services.Implementations.TiepNhanTuDongService>();
builder.Services.AddScoped<IBenhAnService, Qms.Services.Implementations.BenhAnService>();
builder.Services.AddScoped<IWorkflowService, Qms.Services.Implementations.WorkflowService>();
builder.Services.AddScoped<IWaitTimeEstimator, WaitTimeEstimator>();
builder.Services.AddScoped<IWaitTimeMlClient, WaitTimeMlClient>();
builder.Services.AddScoped<WaitTimeSyncService>();
builder.Services.AddScoped<IFaceAiClient, FaceAiClient>();
builder.Services.AddSingleton<IFaceCryptoService, FaceCryptoService>();
builder.Services.AddScoped<IFaceAuditService, FaceAuditService>();
builder.Services.AddScoped<IFaceEnrollmentService, FaceEnrollmentService>();
// Cache gallery embedding (RAM) + so khớp cosine tại backend — thay cho việc ship
// toàn bộ gallery sang Python mỗi check-in.
builder.Services.AddSingleton<IFaceGalleryCache, FaceGalleryCache>();
builder.Services.AddScoped<IUserAdminService, UserAdminService>();
builder.Services.AddScoped<IMenuAdminService, MenuAdminService>();
builder.Services.AddScoped<IDanhMucAdminService, DanhMucAdminService>();
builder.Services.AddScoped<IPermissionMenuService, PermissionMenuService>();
builder.Services.AddScoped<IEmrService, EmrService>();
builder.Services.AddScoped<PushNotificationService>();

// Background services — push realtime overload alert tới Dashboard.
builder.Services.AddHostedService<OverloadMonitor>();
// Cron đồng bộ ActualMinutes cho WaitEstimateLog (đo lường dự báo) mỗi 5 phút.
builder.Services.AddHostedService<WaitTimeSyncJob>();
// Cron đẩy Web Push cho cổng theo dõi BN (sắp tới lượt / đến lượt / quá lượt) mỗi 20s.
builder.Services.AddHostedService<PushNotifierJob>();

// Configure JWT Authentication
var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "DefaultSecretKey1234567890123456789012345678901234567890";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });

// Configure CORS - AllowCredentials required for SignalR.
// Whitelist origins từ Cors:AllowedOrigins (appsettings) thay cho SetIsOriginAllowed(_ => true)
// — tránh CSRF khi browser cho phép credentials đi kèm.
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("QmsFrontend",
        policy =>
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        });
});

// Rate limiting cho endpoint sinh trắc (chống brute-force 1:N + DoS CPU embed).
// Giới hạn rộng (30 req/10s mỗi IP) — không cản thao tác kiosk bình thường.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("face", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromSeconds(10),
                QueueLimit = 0,
            }));
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("QmsFrontend");

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHub<QueueHub>("/ws");

app.Run();
