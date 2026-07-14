# ai-face

Python FastAPI service cho nhận diện khuôn mặt Kiosk QMS. Chạy ở port **5010**.

Thiết kế stateless: service chỉ làm CV (detect + extract embedding). Toàn bộ
embedding và bệnh nhân được quản lý ở BE C# (bảng `PatientFaceEmbedding`) để giữ
RBAC, audit và mã hóa ở một nơi — theo mục **Bảo mật dữ liệu khuôn mặt** trong
đề cương.

## Endpoints

| Method | Path | Vai trò | Auth |
|---|---|---|---|
| GET  | `/health`   | Liveness + model/ngưỡng | mở |
| POST | `/embed`    | multipart `image` → `{embedding: float[512]}` (reject nếu 0 hoặc >1 mặt) | token |
| POST | `/identify` | (legacy) body `{image_b64, candidates}` → best match + margin gate | token |
| GET  | `/camera/status` · `/camera/snapshot` · `/camera/stream` | preview Hikvision | token |

> **Auth**: mọi endpoint trừ `/health` yêu cầu header `X-Internal-Token` khớp
> `FACE_INTERNAL_TOKEN` (nếu biến này được set). Backend C# tự gửi header. Để rỗng
> = không bắt buộc (chỉ dev/local).

## Luồng tích hợp

- **Enroll**: FE chụp ảnh → BE C# `POST /api/v1/face/enroll` → BE gọi ai-face `/embed`
  → BE lưu `PatientFaceEmbedding` (mã hóa AES-256-GCM).
- **Check-in** (kiến trúc mới): FE Kiosk chụp ảnh → BE C# `POST /api/v1/kiosk/face-checkin`
  → BE gọi ai-face `/embed` lấy embedding của **ảnh probe** (KHÔNG gửi cả gallery)
  → BE **so khớp 1:N ngay tại C#** trên `FaceGalleryCache` (RAM, ngưỡng + margin
  top-1/top-2) → BE hoàn tất tiếp nhận + audit log. Endpoint `/identify` giữ lại
  cho tương thích nhưng không còn nằm trên đường check-in.

## Chạy local

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 5010
```

Lần đầu DeepFace sẽ tải `Facenet512.h5` (~90 MB) về `~/.deepface/weights/`.

## Biến môi trường

| Var | Mặc định | Mô tả |
|---|---|---|
| `FACE_MODEL` | `Facenet512` | Tên model DeepFace |
| `FACE_DETECTOR` | `opencv` | Backend detect face (đổi `retinaface`/`mtcnn` để recall tốt hơn) |
| `FACE_COSINE_THRESHOLD` | `1 - FACE_MATCH_THRESHOLD` (=0.6) | Ngưỡng cosine trực tiếp — recognized khi `cosine ≥ ngưỡng` |
| `FACE_MATCH_MARGIN` | `0.06` | Cách biệt tối thiểu top-1 vs top-2 (khác người) để chấp nhận |
| `FACE_MATCH_THRESHOLD` | `0.4` | (legacy) dùng để suy ra `FACE_COSINE_THRESHOLD` nếu biến trên không set |
| `FACE_INTERNAL_TOKEN` | _(rỗng)_ | Shared secret; nếu set thì mọi request (trừ `/health`) phải có header khớp |
| `FACE_ANTI_SPOOFING` | `false` | Bật passive liveness (cần DeepFace + torch; fail-open nếu thiếu) |
