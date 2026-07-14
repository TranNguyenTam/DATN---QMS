"""
validate_external.py — Tầng B: kiểm chứng PHƯƠNG PHÁP trên dữ liệu THẬT công khai
(MIMIC-IV-ED, PhysioNet) thay vì data mô phỏng.

Mục tiêu (đồ án): chứng minh pipeline dự báo thời gian chờ KHÔNG chỉ học vẹt
công thức sinh data mô phỏng, mà bắt được tín hiệu hàng đợi THẬT. Chạy đúng 5
trụ chứng minh:

  Trụ 1  Tái lập pipeline (Linear/RF/XGBoost) + metric (MAE/RMSE/MAPE/P50/P90).
  Trụ 2  VƯỢT baseline (mean / theo-giờ / queueLen-heuristic) → bằng chứng cốt lõi.
  Trụ 3  Temporal split (train quá khứ → test tương lai), KHÔNG random → chống leakage.
  Trụ 4  Feature importance → so với data mô phỏng để bảo vệ tính hiệu chỉnh.
  Trụ 5  In skill score (% giảm MAE so baseline) + phân tích để báo cáo trung thực.

Nguồn data: MIMIC-IV-ED v2.2 — https://physionet.org/content/mimic-iv-ed/2.2/
  Cần file:  ed/edstays.csv(.gz)   (intime, outtime, stay_id, subject_id, ...)
             ed/triage.csv(.gz)    (stay_id, acuity, ...)        [tùy chọn]

Map feature  (model bạn → MIMIC-IV-ED):
  waitMinutes  = (outtime - intime) phút        ED length of stay
  queueLen     = số lượt ĐỒNG THỜI tại intime    (sweep-line, giống export_data.py)
  priorityLevel= triage.acuity (ESI 1..5)        [nếu có triage]
  hourOfDay    = giờ của intime
  dayOfWeek    = thứ của intime (Mon=0)

Cách dùng:
  python validate_external.py --edstays ed/edstays.csv.gz --triage ed/triage.csv.gz
  python validate_external.py --edstays edstays.csv --max-minutes 600 --out report_external.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error
except ImportError as exc:
    print(f"Thiếu dependency: {exc}. Chạy: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

# Console Windows cp1258 → ép UTF-8 cho mũi tên / tiếng Việt.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

FEATURES = ["queueLen", "priorityLevel", "hourOfDay", "dayOfWeek"]
LABEL = "waitMinutes"


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    err = np.abs(y_true - y_pred)
    return {
        "MAE": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "RMSE": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 2),
        "MAPE": round(float(np.mean(err / np.maximum(y_true, 1)) * 100), 2),
        "over10minPct": round(float(np.mean(err > 10) * 100), 2),
        "P50": round(float(np.percentile(err, 50)), 2),
        "P90": round(float(np.percentile(err, 90)), 2),
        "n": int(len(y_true)),
    }


def build_dataset(edstays_path: str, triage_path: str | None, max_minutes: int) -> pd.DataFrame:
    print(f"Đọc {edstays_path} ...", file=sys.stderr)
    ed = pd.read_csv(edstays_path, parse_dates=["intime", "outtime"])
    ed = ed.dropna(subset=["intime", "outtime", "stay_id"]).copy()

    # Label: ED length of stay (phút) = outtime - intime. Tương đương label
    # LaySo→HoanTat của bạn (tổng thời gian trong hệ thống).
    ed["waitMinutes"] = (ed["outtime"] - ed["intime"]).dt.total_seconds() / 60.0
    ed = ed[(ed["waitMinutes"] >= 1) & (ed["waitMinutes"] <= max_minutes)].copy()
    ed = ed.sort_values("intime").reset_index(drop=True)

    # queueLen — sweep-line O(n log n): số BN đã đến (intime<=t) và CHƯA rời
    # (outtime>t) tại đúng thời điểm intime của từng lượt. Trừ 1 = số người khác
    # đang trong hệ thống (giống ý nghĩa queueLen lúc lấy số).
    t = ed["intime"].astype("int64").to_numpy()
    in_sorted = np.sort(ed["intime"].astype("int64").to_numpy())
    out_sorted = np.sort(ed["outtime"].astype("int64").to_numpy())
    arrived = np.searchsorted(in_sorted, t, side="right")
    departed = np.searchsorted(out_sorted, t, side="right")
    ed["queueLen"] = np.maximum(arrived - departed - 1, 0)

    ed["hourOfDay"] = ed["intime"].dt.hour
    ed["dayOfWeek"] = ed["intime"].dt.dayofweek

    # priorityLevel từ triage.acuity (ESI 1..5). Nếu không có → hằng số 3 (neutral)
    # và in cảnh báo (feature này sẽ vô dụng nhưng pipeline vẫn chạy).
    if triage_path:
        print(f"Đọc {triage_path} ...", file=sys.stderr)
        tri = pd.read_csv(triage_path, usecols=lambda c: c in ("stay_id", "acuity"))
        ed = ed.merge(tri, on="stay_id", how="left")
        ed["priorityLevel"] = ed["acuity"].fillna(3).astype(int)
    else:
        print("⚠ Không có triage → priorityLevel=3 (hằng số). Khuyến nghị cung "
              "cấp triage.csv để feature ưu tiên có ý nghĩa.", file=sys.stderr)
        ed["priorityLevel"] = 3

    ed = ed.dropna(subset=FEATURES + [LABEL])
    print(f"Dataset thật: {len(ed):,} lượt | waitMinutes TB={ed['waitMinutes'].mean():.1f} "
          f"phút (min={ed['waitMinutes'].min():.0f}, max={ed['waitMinutes'].max():.0f})",
          file=sys.stderr)
    return ed


def temporal_split(df: pd.DataFrame, test_frac: float = 0.2):
    """Trụ 3: chia theo THỜI GIAN — train quá khứ, test tương lai (chống leakage)."""
    df = df.sort_values("intime").reset_index(drop=True)
    cut = int(len(df) * (1 - test_frac))
    tr, te = df.iloc[:cut], df.iloc[cut:]
    return (tr[FEATURES].to_numpy(), tr[LABEL].to_numpy(dtype=np.float64),
            te[FEATURES].to_numpy(), te[LABEL].to_numpy(dtype=np.float64), tr, te)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--edstays", required=True, help="ed/edstays.csv(.gz) của MIMIC-IV-ED")
    ap.add_argument("--triage", default=None, help="ed/triage.csv(.gz) (tùy chọn, để có acuity)")
    ap.add_argument("--max-minutes", type=int, default=600,
                    help="Cắt LOS quá dài (ED thật có thể >10h). Mặc định 600.")
    ap.add_argument("--out", default="report_external.json")
    args = ap.parse_args()

    df = build_dataset(args.edstays, args.triage, args.max_minutes)
    if len(df) < 100:
        print(f"Chỉ {len(df)} mẫu (<100) — quá ít để chạy. Kiểm tra lại file.", file=sys.stderr)
        return 1
    if len(df) < 1000:
        print(f"⚠ Chỉ {len(df)} mẫu — bản DEMO nhỏ. Kết quả mang tính SƠ BỘ "
              f"(skill score chưa đủ vững thống kê). Dùng full dataset cho con số chính thức.",
              file=sys.stderr)

    Xtr, ytr, Xte, yte, tr, te = temporal_split(df)
    report: dict = {"n_total": len(df), "n_train": len(Xtr), "n_test": len(Xte),
                    "split": "temporal", "models": {}, "baselines": {}}

    # ── Trụ 2: BASELINE ───────────────────────────────────────────────────
    # (a) trung bình toàn cục
    report["baselines"]["mean"] = metrics(yte, np.full_like(yte, ytr.mean()))
    # (b) trung bình theo giờ (seasonal naive)
    hour_mean = tr.groupby("hourOfDay")[LABEL].mean()
    pred_hour = te["hourOfDay"].map(hour_mean).fillna(ytr.mean()).to_numpy()
    report["baselines"]["by_hour"] = metrics(yte, pred_hour)
    # (c) heuristic queueLen (xấp xỉ tầng-1 rule-based): hồi quy 1 biến queueLen
    lin_q = LinearRegression().fit(tr[["queueLen"]].to_numpy(), ytr)
    report["baselines"]["queueLen_rule"] = metrics(yte, lin_q.predict(te[["queueLen"]].to_numpy()))

    # ── Trụ 1: MODEL ──────────────────────────────────────────────────────
    lin = LinearRegression().fit(Xtr, ytr)
    report["models"]["linear"] = metrics(yte, lin.predict(Xte))

    rf = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1).fit(Xtr, ytr)
    report["models"]["random_forest"] = metrics(yte, rf.predict(Xte))
    importances = rf.feature_importances_

    try:
        from xgboost import XGBRegressor

        xgb = XGBRegressor(n_estimators=400, max_depth=6, learning_rate=0.05,
                           subsample=0.8, random_state=42, tree_method="hist").fit(Xtr, ytr)
        report["models"]["xgboost"] = metrics(yte, xgb.predict(Xte))
        importances = xgb.feature_importances_
    except ImportError:
        print("xgboost chưa cài — chỉ dùng RandomForest.", file=sys.stderr)

    # Chọn model tốt nhất theo MAE TEST (argmin) — KHÔNG gán cứng xgboost, tránh
    # báo skill của model overfit khi tập test nhỏ.
    best_name = min(report["models"], key=lambda k: report["models"][k]["MAE"])
    best_metrics = report["models"][best_name]

    # ── Trụ 4: FEATURE IMPORTANCE ─────────────────────────────────────────
    report["feature_importance"] = {
        f: round(float(v), 4) for f, v in sorted(
            zip(FEATURES, importances), key=lambda kv: kv[1], reverse=True)
    }

    # ── Trụ 5: SKILL SCORE (so baseline tốt nhất) ─────────────────────────
    best_baseline_mae = min(b["MAE"] for b in report["baselines"].values())
    skill = (1 - best_metrics["MAE"] / best_baseline_mae) * 100
    report["best_model"] = best_name
    report["skill_score_vs_best_baseline_pct"] = round(skill, 1)

    # ── In bảng ───────────────────────────────────────────────────────────
    print("\n══════════ KẾT QUẢ KIỂM CHỨNG TRÊN DATA THẬT (MIMIC-IV-ED) ══════════")
    print(f"  Mẫu: {len(df):,} (train {len(Xtr):,} / test {len(Xte):,}, temporal split)\n")
    print(f"  {'':<22}{'MAE':>8}{'RMSE':>8}{'MAPE%':>8}{'>10min%':>9}")
    for name, m in {**{f'baseline:{k}': v for k, v in report['baselines'].items()},
                    **{f'model:{k}': v for k, v in report['models'].items()}}.items():
        print(f"  {name:<22}{m['MAE']:>8}{m['RMSE']:>8}{m['MAPE']:>8}{m['over10minPct']:>9}")
    print(f"\n  → Model tốt nhất: {best_name} (MAE={best_metrics['MAE']})")
    print(f"  → Baseline tốt nhất: MAE={best_baseline_mae}")
    print(f"  → SKILL SCORE: giảm {skill:.1f}% MAE so baseline "
          f"{'✓ VƯỢT (chứng minh học tín hiệu thật)' if skill > 0 else '✗ KHÔNG vượt'}")
    print(f"  → Feature importance: {report['feature_importance']}")

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
