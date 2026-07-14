"""
QMS Face AI service — FastAPI wrapper around DeepFace/Facenet512.

Endpoints:
  GET  /health             liveness + model status
  POST /embed              multipart image -> 512-dim embedding
  POST /identify           multipart image + list of (id, embedding) -> best match

The service is intentionally stateless — the QMS backend owns the
embedding database (PatientFaceEmbedding). This keeps RBAC, audit
logging and encryption in one place (C# backend) per the design PDF.
"""
from __future__ import annotations

import hmac
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

# Camera Hikvision (RTSP) — tái sử dụng từ dự án Computer Vision.
# Nếu file không tồn tại hoặc import lỗi → service vẫn chạy với webcam USB FE.
try:
    from camera_manager import HikvisionCamera, CameraConfig
    HIK_AVAILABLE = True
except Exception as _hik_exc:  # noqa: BLE001
    HIK_AVAILABLE = False
    HikvisionCamera = None  # type: ignore
    CameraConfig = None  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qms-face-ai")

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

MODEL_NAME = os.environ.get("FACE_MODEL", "Facenet512")
# 'ssd' (OpenCV DNN res10) recall TỐT hơn nhiều 'opencv' (Haar) — Haar hay bỏ sót
# mặt thật (góc nghiêng / tay che) + báo nhầm nhiều mặt (gương/nền). Đổi sang 'retinaface'
# nếu muốn chính xác hơn nữa (chậm hơn, cần model tải về).
DETECTOR = os.environ.get("FACE_DETECTOR", "ssd")
# Ngưỡng cosine vận hành: recognized khi cosine >= COSINE_THRESHOLD. Giữ
# MATCH_THRESHOLD cũ để tương thích ngược (cosine mặc định = 1 - MATCH_THRESHOLD).
MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.4"))
COSINE_THRESHOLD = float(os.environ.get("FACE_COSINE_THRESHOLD", str(round(1.0 - MATCH_THRESHOLD, 4))))
# Biên cách biệt top-1 vs top-2 (khác người) — chống nhận nhầm 2 người giống nhau.
MATCH_MARGIN = float(os.environ.get("FACE_MATCH_MARGIN", "0.06"))
# Shared secret giữa backend C# và service này. Rỗng = không bắt buộc (dev/local).
INTERNAL_TOKEN = os.environ.get("FACE_INTERNAL_TOKEN", "")
# Liveness/anti-spoofing (opt-in). Cần DeepFace + torch; fail-open nếu thiếu.
ANTI_SPOOFING = os.environ.get("FACE_ANTI_SPOOFING", "false").lower() in ("1", "true", "yes")

_model_ready = False


@asynccontextmanager
async def _lifespan(_app: "FastAPI"):
    """Warmup model lúc khởi động + đóng camera khi shutdown (thay @app.on_event)."""
    global _model_ready
    try:
        from deepface import DeepFace

        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        # Nạp model embedding (Facenet512) — 'skip' bỏ qua detection.
        DeepFace.represent(
            img_path=dummy, model_name=MODEL_NAME,
            detector_backend="skip", enforce_detection=False,
        )
        # Nạp THÊM detector chính (ssd) vào RAM để request ĐẦU không bị chậm vì
        # phải load weights ('skip' ở trên KHÔNG nạp detector nào).
        try:
            DeepFace.represent(
                img_path=dummy, model_name=MODEL_NAME,
                detector_backend=DETECTOR, enforce_detection=False,
            )
        except Exception as exc:  # noqa: BLE001 — lỗi warmup detector không chặn start
            log.warning("Warmup detector '%s' lỗi: %s", DETECTOR, exc)
        _model_ready = True
        log.info(
            "Model %s warm (cosine_threshold=%.3f, margin=%.3f, anti_spoofing=%s)",
            MODEL_NAME, COSINE_THRESHOLD, MATCH_MARGIN, ANTI_SPOOFING,
        )
    except Exception:
        log.exception("Model warmup failed")
    yield
    try:
        if _hik_camera is not None:
            _hik_camera.disconnect()
    except Exception:
        pass


app = FastAPI(title="QMS Face AI", version="0.1.0", lifespan=_lifespan)


@app.middleware("http")
async def _internal_auth(request, call_next):
    """Chặn truy cập trái phép tới /embed, /identify, /camera/* khi đã cấu hình
    FACE_INTERNAL_TOKEN (backend C# gửi header X-Internal-Token). /health luôn mở."""
    if INTERNAL_TOKEN and request.url.path != "/health":
        if not hmac.compare_digest(request.headers.get("X-Internal-Token", ""), INTERNAL_TOKEN):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)

# ─── Camera Hikvision (optional, fallback graceful sang webcam USB) ──────────
HIK_IP = os.environ.get("HIK_CAMERA_IP", "192.168.1.6")
HIK_USER = os.environ.get("HIK_CAMERA_USER", "admin")
HIK_PASS = os.environ.get("HIK_CAMERA_PASSWORD", "")
HIK_STREAM = int(os.environ.get("HIK_CAMERA_STREAM", "2"))  # 2 = sub stream nhẹ hơn
HIK_ENABLED = os.environ.get("HIK_CAMERA_ENABLED", "true").lower() in ("1", "true", "yes")

_hik_camera: Any = None  # HikvisionCamera | None — dùng Any tránh forward-ref khi import fail
_hik_lock = threading.Lock()
_hik_last_attempt = 0.0
_hik_retry_cooldown = 30.0  # tránh retry liên tục nếu camera offline


def _ensure_hik_camera() -> Any:
    """Lazy-init Hikvision camera + start background capture thread.
    Trả None nếu không kết nối được (có cooldown để tránh retry mọi request)."""
    global _hik_camera, _hik_last_attempt
    if not HIK_AVAILABLE or not HIK_ENABLED:
        return None

    with _hik_lock:
        if _hik_camera and _hik_camera.is_connected and _hik_camera.is_running:
            return _hik_camera

        now = time.time()
        if now - _hik_last_attempt < _hik_retry_cooldown:
            return None
        _hik_last_attempt = now

        try:
            cfg = CameraConfig(
                ip=HIK_IP, username=HIK_USER, password=HIK_PASS,
                channel=1, stream=HIK_STREAM,
                width=1280, height=720, fps=15,
                connection_timeout=5, read_timeout=3, transport="tcp",
            )
            cam = HikvisionCamera(cfg)
            if cam.connect():
                # CRITICAL: bật thread đọc RTSP liên tục vào queue. Khi snapshot
                # endpoint gọi read_latest() → trả frame mới nhất từ queue (instant),
                # không block chờ cap.read() từ network. Giảm latency 200-400ms → 1-5ms.
                cam.start_capture()
                _hik_camera = cam
                # Khởi động JPEG encoder background → cache bytes sẵn.
                _start_jpeg_encoder(cam)
                log.info("Hikvision camera connected + threading capture: %s", HIK_IP)
                return cam
            log.warning("Hikvision camera connect failed: %s", HIK_IP)
        except Exception as exc:  # noqa: BLE001
            log.warning("Hikvision init error: %s", exc)
        return None


# ─── JPEG cache: encode 1 lần / 100ms, snapshot endpoint trả từ cache ─────────
_jpeg_cache: bytes = b""
_jpeg_cache_ts: float = 0.0
_jpeg_lock = threading.Lock()
_jpeg_thread_started = False
_jpeg_quality = int(os.environ.get("HIK_JPEG_QUALITY", "75"))
_jpeg_target_fps = int(os.environ.get("HIK_PREVIEW_FPS", "10"))


def _start_jpeg_encoder(cam: Any) -> None:
    """Background thread: lấy latest frame, encode JPEG vào cache. Snapshot
    endpoint chỉ cần trả _jpeg_cache → response ~1ms."""
    global _jpeg_thread_started
    if _jpeg_thread_started:
        return
    _jpeg_thread_started = True

    def loop():
        interval = 1.0 / max(1, _jpeg_target_fps)
        global _jpeg_cache, _jpeg_cache_ts
        while True:
            try:
                if not cam.is_running:
                    time.sleep(0.5)
                    continue
                ok, frame = cam.read_latest()
                if not ok or frame is None:
                    time.sleep(0.05)
                    continue
                enc_ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, _jpeg_quality])
                if enc_ok:
                    with _jpeg_lock:
                        _jpeg_cache = buf.tobytes()
                        _jpeg_cache_ts = time.time()
            except Exception as exc:  # noqa: BLE001
                log.warning("JPEG encoder loop error: %s", exc)
            time.sleep(interval)

    t = threading.Thread(target=loop, daemon=True, name="hik-jpeg-encoder")
    t.start()


def _decode(file_bytes: bytes) -> np.ndarray:
    """Decode JPG/PNG/HEIC. HEIC fallback dùng pillow-heif (ảnh iPhone).
    Logic lấy từ FaceEmbedding.read_image bên project Computer Vision."""
    arr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is not None:
        return img

    # Fallback HEIC qua pillow-heif (Apple format)
    try:
        from PIL import Image
        import pillow_heif
        heif_file = pillow_heif.read_heif(file_bytes)
        pil_img = Image.frombytes(
            heif_file.mode, heif_file.size, heif_file.data, "raw"
        )
        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception:
        pass

    # Fallback imageio (đôi khi HEIC qua imageio cũng work)
    try:
        import imageio
        out = imageio.v3.imread(file_bytes, extension=".heic")
        if out is not None:
            return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
    except Exception:
        pass

    raise HTTPException(status_code=400, detail="Không đọc được ảnh (hỗ trợ JPG/PNG/HEIC)")


def _check_liveness(img: np.ndarray) -> None:
    """Passive anti-spoofing (opt-in qua FACE_ANTI_SPOOFING=true). Fail-open: nếu
    model/torch chưa cài thì BỎ QUA để không chặn demo — chỉ raise khi chắc chắn giả mạo."""
    try:
        from deepface import DeepFace

        faces = DeepFace.extract_faces(
            img_path=img, detector_backend=DETECTOR,
            enforce_detection=False, anti_spoofing=True,
        )
    except Exception as exc:  # torch/model thiếu → bỏ qua (không chặn)
        log.warning("Liveness không khả dụng (%s) — bỏ qua kiểm tra", type(exc).__name__)
        return
    for f in faces:
        if f.get("is_real") is False:
            raise HTTPException(
                status_code=422,
                detail="Ảnh nghi giả mạo (ảnh in / màn hình). Vui lòng dùng khuôn mặt thật.",
            )


def _embed(img: np.ndarray) -> list[float]:
    from deepface import DeepFace

    if ANTI_SPOOFING:
        _check_liveness(img)

    # Thử LẦN LƯỢT nhiều detector tới khi 1 cái thấy mặt — ảnh rõ mà 1 detector
    # bỏ sót (do lighting/góc) thì detector khác bắt được → hết "Không phát hiện"
    # oan. 'ssd'/'retinaface' khỏe hơn 'opencv'(Haar). Detector thiếu package /
    # không thấy mặt (ValueError) → bỏ qua, thử cái kế.
    # Chỉ dùng detector NHANH + CÓ SẴN: ssd (chính — recall tốt, chính xác) →
    # opencv (dự phòng — luôn có). BỎ retinaface/mtcnn: chậm (ResNet50) + KHÔNG
    # cài trong requirements → trước đây mỗi request thử rồi fail ~3-5s → timeout.
    # Độ chính xác KHÔNG đổi (vẫn ssd là chính), chỉ nhanh hơn rất nhiều.
    candidates: list[str] = []
    for d in (DETECTOR, "opencv"):
        if d and d not in candidates:
            candidates.append(d)

    result = None
    for det in candidates:
        try:
            r = DeepFace.represent(
                img_path=img,
                model_name=MODEL_NAME,
                detector_backend=det,
                enforce_detection=True,
                align=True,
            )
            if r:
                result = r
                break
        except Exception as exc:  # noqa: BLE001 — no-face / detector thiếu → thử kế tiếp
            log.info("Detector '%s' bỏ qua: %s", det, exc)
            continue

    if not result:
        # DeepFace raise khi enforce_detection=True và không thấy mặt → 422 sạch
        # (nghiệp vụ bình thường) thay vì 500 + stacktrace.
        raise HTTPException(status_code=422, detail="Không phát hiện khuôn mặt trong ảnh")
    # Nhiều khuôn mặt → CHỌN MẶT LỚN NHẤT (gần camera nhất) thay vì từ chối.
    # Detector hay báo nhầm thêm mặt từ nền/gương; người cần nhận diện luôn là
    # người ở gần (mặt lớn nhất trong khung) → an toàn + không chặn nhầm.
    if len(result) > 1:
        result = sorted(
            result,
            key=lambda r: (
                (r.get("facial_area") or {}).get("w", 0)
                * (r.get("facial_area") or {}).get("h", 0)
            ),
            reverse=True,
        )
    vec = np.asarray(result[0]["embedding"], dtype=np.float32)
    vec = vec / (np.linalg.norm(vec) + 1e-9)
    return vec.tolist()


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


class Candidate(BaseModel):
    patientCode: str
    embedding: list[float]


class IdentifyBody(BaseModel):
    image_b64: str
    candidates: list[Candidate]


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": _model_ready,
        "model": MODEL_NAME,
        "detector": DETECTOR,
        "cosineThreshold": COSINE_THRESHOLD,
        "margin": MATCH_MARGIN,
        "antiSpoofing": ANTI_SPOOFING,
    }


# ─── Camera Hikvision endpoints (auto-fallback USB webcam ở FE) ──────────────

@app.get("/camera/status")
def camera_status() -> dict[str, Any]:
    """FE gọi trước khi mở capture modal — nếu hikAvailable=true thì preview
    qua /camera/stream, không thì fallback navigator.mediaDevices (webcam USB)."""
    if not HIK_AVAILABLE:
        return {"hikAvailable": False, "reason": "camera_manager import failed"}
    if not HIK_ENABLED:
        return {"hikAvailable": False, "reason": "disabled by HIK_CAMERA_ENABLED=false"}
    cam = _ensure_hik_camera()
    if cam is None:
        return {
            "hikAvailable": False,
            "reason": "Không kết nối được camera Hikvision (offline / sai password / IP sai)",
            "ip": HIK_IP,
        }
    return {
        "hikAvailable": True,
        "ip": HIK_IP,
        "stream": HIK_STREAM,
        "stats": cam.get_stats(),
    }


def _read_hik_frame() -> np.ndarray:
    """Lấy frame mới nhất từ queue background (read_latest = không block).
    Raise HTTPException nếu camera offline hoặc queue rỗng."""
    cam = _ensure_hik_camera()
    if cam is None:
        raise HTTPException(status_code=503, detail="Camera Hikvision không sẵn sàng")
    ok, frame = cam.read_latest()
    if not ok or frame is None:
        # Queue rỗng tạm thời (mới khởi động) — chờ 1 tick rồi thử lại.
        time.sleep(0.1)
        ok, frame = cam.read_latest()
        if not ok or frame is None:
            raise HTTPException(status_code=503, detail="Queue Hikvision rỗng — chờ background thread")
    return frame


@app.get("/camera/snapshot")
def camera_snapshot() -> Response:
    """Trả JPEG từ cache (background encoder cập nhật ~10fps).
    Response time ~1-3ms thay vì 100-300ms (cap.read + encode mỗi call)."""
    cam = _ensure_hik_camera()
    if cam is None:
        raise HTTPException(status_code=503, detail="Camera Hikvision không sẵn sàng")

    with _jpeg_lock:
        cache = _jpeg_cache
        ts = _jpeg_cache_ts

    # Nếu cache mới quá 2s → coi như stale, fallback encode trực tiếp.
    if not cache or (time.time() - ts) > 2.0:
        frame = _read_hik_frame()
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, _jpeg_quality])
        if not ok:
            raise HTTPException(status_code=500, detail="Encode JPEG thất bại")
        cache = buf.tobytes()

    return Response(
        content=cache,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


def _mjpeg_generator():
    """Stream MJPEG cho FE preview realtime — yield boundary frame JPEG liên tục."""
    boundary = b"--frame"
    while True:
        try:
            frame = _read_hik_frame()
        except HTTPException:
            time.sleep(0.5)
            continue
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            time.sleep(0.05)
            continue
        chunk = (
            boundary + b"\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Content-Length: " + str(len(buf)).encode() + b"\r\n\r\n"
            + buf.tobytes() + b"\r\n"
        )
        yield chunk
        time.sleep(1.0 / 12)  # ~12 fps đủ cho preview, giảm CPU


@app.get("/camera/stream")
def camera_stream() -> StreamingResponse:
    """MJPEG stream cho FE preview. Dùng <img src="/camera/stream"> hiển thị
    liên tục như video."""
    if _ensure_hik_camera() is None:
        raise HTTPException(status_code=503, detail="Camera Hikvision không sẵn sàng")
    return StreamingResponse(
        _mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )




@app.post("/embed")
async def embed(image: UploadFile = File(...)) -> dict[str, Any]:
    t0 = time.perf_counter()
    img = _decode(await image.read())
    # Gọi trực tiếp trên event-loop thread (cùng thread warmup) — TensorFlow/Keras
    # bị ràng buộc theo thread nên KHÔNG đẩy ra threadpool (gây 500 ngắt quãng).
    # Muốn xử lý song song ở production → chạy đa worker (gunicorn -w N), không threadpool.
    vec = _embed(img)
    # Log thời gian thực tế để kiểm chứng tốc độ (detector + embed).
    log.info("embed xong %.0f ms (detector=%s)", (time.perf_counter() - t0) * 1000, DETECTOR)
    return {"model": MODEL_NAME, "dim": len(vec), "embedding": vec}


@app.post("/identify")
async def identify(body: IdentifyBody) -> JSONResponse:
    """Legacy 1:N (backend mới so khớp tại C#). Vẫn giữ đúng: margin gate + ngưỡng
    cosine + xử lý không-thấy-mặt như nghiệp vụ bình thường (không 500)."""
    import base64

    try:
        raw = base64.b64decode(body.image_b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"image_b64 không hợp lệ: {exc}")

    img = _decode(raw)
    try:
        query = np.asarray(_embed(img), dtype=np.float32)
    except HTTPException as exc:
        # Không thấy mặt / nhiều mặt / nghi giả mạo = bình thường → recognized=false.
        return JSONResponse({
            "recognized": False, "patientCode": None, "confidence": 0.0,
            "threshold": COSINE_THRESHOLD, "margin": MATCH_MARGIN, "reason": exc.detail,
        })

    # best cosine theo TỪNG BN (multi-image), rồi lấy top-1 vs top-2 (khác BN).
    per: dict[str, float] = {}
    for c in body.candidates:
        if len(c.embedding) != len(query):
            continue
        s = _cosine(query, np.asarray(c.embedding, dtype=np.float32))
        if c.patientCode not in per or s > per[c.patientCode]:
            per[c.patientCode] = s

    best_code, best_s, second_s = None, -1.0, -1.0
    for code, s in per.items():
        if s > best_s:
            second_s = best_s
            best_s, best_code = s, code
        elif s > second_s:
            second_s = s

    best_s = max(best_s, 0.0)
    second_s = max(second_s, 0.0)
    recognized = best_s >= COSINE_THRESHOLD and (best_s - second_s) >= MATCH_MARGIN
    return JSONResponse({
        "recognized": recognized,
        "patientCode": best_code if recognized else None,
        "confidence": round(best_s, 4),
        "threshold": COSINE_THRESHOLD,
        "margin": MATCH_MARGIN,
    })
