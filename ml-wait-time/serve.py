"""
Inference service cho dự báo thời gian chờ (tầng 2).

Triển khai ở port 5011. Backend C# gọi:
  POST /predict   body: {features: {queueLen, queueType, phongBanId,
                                     priorityLevel, hourOfDay, dayOfWeek}}
                  trả: {predictedMinutes, confidence, model}

Confidence = 1 - MAE / (predicted + MAE), MAE lấy từ artifacts/meta.json
(sai số kiểm định thực tế khi train). Công thức áp dụng cho MỌI model
(XGBoost không có estimators_ như RandomForest): dự báo càng lớn sai số
tương đối càng nhỏ → confidence càng cao; dự báo vài phút → confidence
thấp → backend chủ động fallback rule-based (an toàn cho wait ~0).
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qms-ml-wait")

ARTIFACTS = Path(os.environ.get("WAIT_ARTIFACTS", "artifacts"))
app = FastAPI(title="QMS Wait-Time ML", version="0.1.0")

_model = None
_features: list[str] = []
_mae: float = 10.0  # fallback nếu chưa có meta.json


@app.on_event("startup")
def _load() -> None:
    global _model, _features, _mae
    try:
        _model = joblib.load(ARTIFACTS / "model.pkl")
        _features = joblib.load(ARTIFACTS / "features.pkl")
        try:
            with open(ARTIFACTS / "meta.json", encoding="utf-8") as f:
                _mae = float(json.load(f).get("mae", _mae))
        except Exception:
            log.warning("meta.json chưa có — dùng MAE mặc định %.1f", _mae)
        log.info("Loaded model=%s features=%s mae=%.2f",
                 type(_model).__name__, _features, _mae)
    except Exception as exc:
        log.warning("Model chưa sẵn sàng (%s). Dùng /health để check.", exc)


class Features(BaseModel):
    queueLen: int
    queueType: int
    phongBanId: int
    priorityLevel: int
    hourOfDay: int
    dayOfWeek: int


class PredictBody(BaseModel):
    features: Features


def _confidence(pred: float) -> float:
    """Confidence từ MAE kiểm định, áp dụng cho mọi loại model.

    conf = 1 - MAE / (pred + MAE):
      - pred lớn (chờ lâu)  → MAE chiếm tỉ lệ nhỏ → conf cao (tin ML)
      - pred ~0 (chờ ngắn)  → conf thấp → backend fallback rule-based
    """
    conf = 1.0 - _mae / (max(pred, 0.0) + _mae)
    return float(max(0.0, min(0.95, conf)))


@app.get("/health")
def health() -> dict:
    return {
        "ok": _model is not None,
        "model": type(_model).__name__ if _model is not None else None,
        "features": _features,
    }


@app.post("/predict")
def predict(body: PredictBody) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="Model chưa load")

    feats = body.features.model_dump()
    x = np.array([feats[k] for k in _features], dtype=np.float32)
    pred = float(_model.predict(x.reshape(1, -1))[0])
    pred = max(0.0, pred)
    return {
        "predictedMinutes": round(pred, 1),
        "confidence": round(_confidence(pred), 3),
        "model": type(_model).__name__,
    }
