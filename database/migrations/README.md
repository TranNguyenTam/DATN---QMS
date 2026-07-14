# database/migrations (legacy)

SQL idempotent cho các bảng QMS bổ sung — **legacy**. Migration mới đã gộp vào
[`../setup/05_schema_innovation.sql`](../setup/05_schema_innovation.sql) khi
chuyển sang DB local `QMS_DA`.

3 file trong folder này:
1. [`001_WaitEstimateLog.sql`](001_WaitEstimateLog.sql) — log dự báo & thực tế.
2. [`002_PatientFaceEmbedding.sql`](002_PatientFaceEmbedding.sql) — embedding
   Facenet512 mã hóa AES-256-GCM.
3. [`003_FaceAuditLog.sql`](003_FaceAuditLog.sql) — audit log Nghị định 13/2023.

## Cách chạy (chỉ dùng nếu apply lên DB ngoài QMS_DA)

```bash
sqlcmd -S <YOUR_SERVER> -d <YOUR_DB> -U <USER> -P '<PASSWORD>' \
       -C -i 001_WaitEstimateLog.sql
# tương tự cho 002 + 003
```

Cho local dev → dùng `../setup/` thay vì folder này.
