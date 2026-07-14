"""
validate_robustness.py — Độ tin cậy THỐNG KÊ cho module dự báo thời gian chờ.
KHÔNG cần dataset ngoài. Hai phần:

  PHẦN 1 — Bootstrap 95% CI trên N lượt PHỤC VỤ THẬT (bảng WaitEstimateLog).
    Trả lời nỗi lo "chỉ 60 lượt thì có đáng tin?" bằng cách LƯỢNG HÓA bất định:
    báo cáo "MAE = x phút (95% CI [lo, hi])" thay vì một con số trần trụi.

  PHẦN 2 — k-fold cross-validation trên 20k mô phỏng.
    Chứng minh MAE ỔN ĐỊNH qua các fold (không phải may rủi 1 lần chia train/test),
    kèm CI bootstrap trên dự báo out-of-fold của TOÀN bộ 20k.

Cách dùng:
  python validate_robustness.py                          # DB QMS_DA + data/wait_time_samples.csv
  python validate_robustness.py --real-csv real.csv      # offline: CSV cột served,actual
  python validate_robustness.py --folds 5 --boot 10000
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import joblib  # noqa: F401  (giữ đồng bộ môi trường train)
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error
    from sklearn.model_selection import TimeSeriesSplit
except ImportError as exc:
    print(f"Thiếu dependency: {exc}. Chạy: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

FEATURES = ["queueLen", "queueType", "phongBanId", "priorityLevel", "hourOfDay", "dayOfWeek"]
LABEL = "waitMinutes"

DEFAULT_CONN = os.environ.get(
    "QMS_CONN",
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost\\SQLEXPRESS;Database=QMS_DA;"
    "Trusted_Connection=yes;TrustServerCertificate=yes;",
)

# Giá trị ĐÃ phục vụ người dùng: ML nếu lượt đó dùng ML, ngược lại rule.
SQL_REAL = r"""
SELECT
    CASE WHEN MethodUsed LIKE 'ml-%' THEN PredictedMinutesMl
         ELSE PredictedMinutesRule END        AS served,
    ActualMinutes                             AS actual
FROM dbo.WaitEstimateLog
WHERE ActualMinutes IS NOT NULL
  AND (CASE WHEN MethodUsed LIKE 'ml-%' THEN PredictedMinutesMl
            ELSE PredictedMinutesRule END) IS NOT NULL
"""


def make_model():
    """Cùng công thức train.py: ưu tiên XGBoost, fallback RandomForest."""
    try:
        from xgboost import XGBRegressor

        return "xgboost", XGBRegressor(
            n_estimators=400, max_depth=6, learning_rate=0.05,
            subsample=0.8, random_state=42, tree_method="hist")
    except ImportError:
        return "random_forest", RandomForestRegressor(
            n_estimators=200, random_state=42, n_jobs=-1)


def bootstrap_mae_ci(errors: np.ndarray, B: int, rng) -> tuple[float, float, float]:
    """MAE + khoảng tin cậy 95% bằng bootstrap percentile trên |sai số|."""
    n = len(errors)
    idx = rng.integers(0, n, size=(B, n))
    boot = errors[idx].mean(axis=1)
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return float(errors.mean()), float(lo), float(hi)


def load_real(real_csv: str | None, conn: str) -> pd.DataFrame | None:
    if real_csv:
        print(f"[real] đọc {real_csv}", file=sys.stderr)
        return pd.read_csv(real_csv)
    try:
        import pyodbc

        print("[real] kéo lượt phục vụ thật từ WaitEstimateLog...", file=sys.stderr)
        with pyodbc.connect(conn, timeout=5) as cn:
            return pd.read_sql(SQL_REAL, cn)
    except Exception as exc:
        print(f"[real] KHÔNG đọc được DB ({exc}). Bỏ qua Phần 1 — dùng --real-csv để chạy offline.",
              file=sys.stderr)
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/wait_time_samples.csv", help="20k mô phỏng cho k-fold")
    ap.add_argument("--real-csv", default=None, help="CSV cột served,actual (thay cho DB)")
    ap.add_argument("--conn", default=DEFAULT_CONN)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--boot", type=int, default=10000)
    ap.add_argument("--out", default="report_robustness.json")
    args = ap.parse_args()

    rng = np.random.default_rng(42)
    report: dict = {}

    # ── PHẦN 1: Bootstrap CI trên data vận hành thật ──────────────────────
    print("\n══════ PHẦN 1 — Vận hành thật: MAE + 95% CI (bootstrap) ══════")
    real = load_real(args.real_csv, args.conn)
    if real is not None and len(real) >= 5:
        real = real.dropna(subset=["served", "actual"])
        err = np.abs(real["served"].to_numpy(float) - real["actual"].to_numpy(float))
        mae, lo, hi = bootstrap_mae_ci(err, args.boot, rng)
        sq = (real["served"].to_numpy(float) - real["actual"].to_numpy(float)) ** 2
        rmse_boot = np.sqrt(sq[rng.integers(0, len(sq), size=(args.boot, len(sq)))].mean(axis=1))
        rlo, rhi = np.percentile(rmse_boot, [2.5, 97.5])
        report["operational"] = {
            "n": int(len(err)), "MAE": round(mae, 2),
            "MAE_CI95": [round(lo, 2), round(hi, 2)],
            "RMSE": round(float(np.sqrt(sq.mean())), 2),
            "RMSE_CI95": [round(float(rlo), 2), round(float(rhi), 2)],
            "median_abs_err": round(float(np.median(err)), 2),
        }
        print(f"  n = {len(err)} lượt phục vụ thật")
        print(f"  MAE  = {mae:.2f} phút   (95% CI [{lo:.2f}, {hi:.2f}])")
        print(f"  RMSE = {np.sqrt(sq.mean()):.2f} phút   (95% CI [{rlo:.2f}, {rhi:.2f}])")
        print(f"  → Báo cáo: \"MAE 9.91 phút\" thành \"MAE {mae:.2f} phút, 95% CI "
              f"[{lo:.2f}, {hi:.2f}]\" — trung thực & vững.")
    else:
        print("  (bỏ qua — không có data thật; chạy lại khi DB sẵn hoặc dùng --real-csv)")
        report["operational"] = None

    # ── PHẦN 2: CV THEO THỜI GIAN trên 20k mô phỏng (khớp temporal split của train.py) ──
    print(f"\n══════ PHẦN 2 — CV theo thời gian ({args.folds} fold) trên data mô phỏng ══════")
    df = pd.read_csv(args.data).dropna(subset=FEATURES + [LABEL])
    # Sắp theo thời điểm lấy số rồi forward-chaining (train quá khứ → test tương lai),
    # KHÔNG random — tránh rò rỉ tương lai, khớp cách chia của train.py.
    if "takeTime" in df.columns:
        df = df.sort_values("takeTime").reset_index(drop=True)
    X = df[FEATURES].to_numpy(float)
    y = df[LABEL].to_numpy(float)
    name, _ = make_model()
    tscv = TimeSeriesSplit(n_splits=args.folds)

    fold_maes = []
    te_idx_all, te_pred_all = [], []
    for i, (tr, te) in enumerate(tscv.split(X), 1):
        _, model = make_model()
        model.fit(X[tr], y[tr])
        pred = model.predict(X[te])
        fm = float(mean_absolute_error(y[te], pred))
        fold_maes.append(round(fm, 3))
        te_idx_all.append(te)
        te_pred_all.append(pred)
        print(f"  fold {i}: train={len(tr):,} test={len(te):,}  MAE = {fm:.3f}")

    fold_maes_np = np.array(fold_maes)
    te_idx = np.concatenate(te_idx_all)
    te_pred = np.concatenate(te_pred_all)
    cov_err = np.abs(y[te_idx] - te_pred)
    test_mae, test_lo, test_hi = bootstrap_mae_ci(cov_err, args.boot, rng)
    report["kfold"] = {
        "model": name, "scheme": "TimeSeriesSplit (temporal forward-chaining)",
        "folds": args.folds,
        "fold_MAEs": fold_maes,
        "mean_MAE": round(float(fold_maes_np.mean()), 3),
        "std_MAE": round(float(fold_maes_np.std(ddof=1)), 3),
        "test_MAE": round(test_mae, 3),
        "test_MAE_CI95": [round(test_lo, 3), round(test_hi, 3)],
        "n_test_covered": int(len(cov_err)),
        "n": int(len(y)),
    }
    print(f"\n  Model = {name} | {len(y):,} mẫu | CV theo thời gian (forward-chaining)")
    print(f"  MAE qua {args.folds} fold = {fold_maes_np.mean():.3f} ± {fold_maes_np.std(ddof=1):.3f} phút")
    print(f"  MAE trên các đoạn test = {test_mae:.3f} phút (95% CI [{test_lo:.3f}, {test_hi:.3f}])")
    spread = fold_maes_np.max() - fold_maes_np.min()
    print(f"  → Chênh lệch fold cao–thấp {spread:.3f} phút (chia theo thời gian, khớp train.py temporal).")

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
