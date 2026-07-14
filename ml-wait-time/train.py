"""
Train model dự báo thời gian chờ (tầng 2 theo PDF).

Baseline: LinearRegression.
Main:     RandomForest + XGBoost.

Metrics: MAE, RMSE, MAPE, tỷ lệ lệch quá 10 phút, P50/P90 (theo mục
"Metric cho dự báo thời gian chờ" trong đề cương).

Chia train/test THEO THỜI GIAN (không ngẫu nhiên) để tránh rò rỉ tương lai:
dữ liệu hàng đợi là chuỗi thời gian, nên lấy 80% mốc sớm làm train, 20% mốc
muộn hơn làm test — phản ánh đúng cách model dự báo trên dữ liệu mới đến.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error
except ImportError as exc:
    print(f"Missing dependency: {exc}", file=sys.stderr)
    sys.exit(1)


FEATURES = [
    "queueLen", "queueType", "phongBanId", "priorityLevel",
    "hourOfDay", "dayOfWeek",
]
LABEL = "waitMinutes"


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mape = float(np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100)
    over10 = float(np.mean(np.abs(y_true - y_pred) > 10) * 100)
    abs_err = np.abs(y_true - y_pred)
    return {
        "MAE": round(mae, 2),
        "RMSE": round(rmse, 2),
        "MAPE": round(mape, 2),
        "over10minPct": round(over10, 2),
        "P50": float(np.percentile(abs_err, 50)),
        "P90": float(np.percentile(abs_err, 90)),
        "n": int(len(y_true)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/wait_time_samples.csv")
    ap.add_argument("--out", default="artifacts")
    args = ap.parse_args()

    df = pd.read_csv(args.data)
    df = df.dropna(subset=FEATURES + [LABEL])

    # Chia THEO THỜI GIAN (tránh rò rỉ tương lai): sắp xếp theo thời điểm lấy số,
    # lấy 80% đầu (quá khứ) làm train, 20% cuối (tương lai) làm test.
    if "takeTime" in df.columns:
        df = df.sort_values("takeTime")
    X = df[FEATURES].to_numpy()
    y = df[LABEL].to_numpy(dtype=np.float32)
    split = int(len(X) * 0.8)
    Xtr, Xte, ytr, yte = X[:split], X[split:], y[:split], y[split:]

    report = {}
    Path(args.out).mkdir(parents=True, exist_ok=True)

    lin = LinearRegression().fit(Xtr, ytr)
    report["linear"] = metrics(yte, lin.predict(Xte))

    rf = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1).fit(Xtr, ytr)
    report["random_forest"] = metrics(yte, rf.predict(Xte))

    try:
        from xgboost import XGBRegressor

        xgb = XGBRegressor(
            n_estimators=400, max_depth=6, learning_rate=0.05,
            subsample=0.8, random_state=42, tree_method="hist",
        ).fit(Xtr, ytr)
        report["xgboost"] = metrics(yte, xgb.predict(Xte))
        best_name, best_model = "xgboost", xgb
    except ImportError:
        print("xgboost không cài, dùng RandomForest.", file=sys.stderr)
        best_name, best_model = "random_forest", rf

    joblib.dump(best_model, Path(args.out) / "model.pkl")
    joblib.dump(FEATURES, Path(args.out) / "features.pkl")

    # meta.json — serve.py dùng MAE/RMSE để tính confidence cho MỌI loại
    # model (XGBoost không có estimators_ như RandomForest). Confidence
    # phản ánh sai số kiểm định thực tế thay vì hằng số 0.5 cứng.
    best_metrics = report[best_name]
    with open(Path(args.out) / "meta.json", "w", encoding="utf-8") as f:
        json.dump(
            {"best": best_name, "mae": best_metrics["MAE"], "rmse": best_metrics["RMSE"]},
            f, indent=2, ensure_ascii=False,
        )

    with open(Path(args.out) / "report.json", "w", encoding="utf-8") as f:
        json.dump({"best": best_name, "metrics": report}, f, indent=2, ensure_ascii=False)

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nBest: {best_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
