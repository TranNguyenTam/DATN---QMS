"""
retrain_guard.py — Champion–Challenger retrain cho model dự báo thời gian chờ.

Bối cảnh (đồ án, tầng 2): model production `artifacts/model.pkl` ban đầu train
trên data seed/mô phỏng. Khi hệ thống chạy thật, mỗi lần `/predict` được gọi,
backend log 1 dòng vào `dbo.WaitEstimateLog`; sau khi BN hoàn tất, cron
`WaitTimeSyncJob` điền `ActualMinutes` = thời gian chờ THỰC TẾ (nhãn giám sát
tự sinh). Xem `WaitTimeSyncService.cs`.

Script này KHÔNG retrain mù hằng ngày. Nó retrain CÓ ĐIỀU KIỆN:

  1. Kéo data THẬT đã có nhãn (`ActualMinutes`) từ `WaitEstimateLog`.
  2. Chia train/test THEO THỜI GIAN (80% mốc sớm train, 20% muộn test) — tránh
     rò rỉ tương lai, khớp cách chia ở train.py.
  3. Train 1 model "challenger" trên tập train.
  4. Đo MAE của CẢ champion (`model.pkl` đang chạy) LẪN challenger trên CÙNG
     một tập test thật → so sánh công bằng (champion gốc đo MAE trên data seed,
     không thể đem so trực tiếp; phải đo lại trên data thật).
  5. CHỈ thay model production nếu challenger tốt hơn champion vượt `--margin`.
     Ngược lại GIỮ NGUYÊN champion. Mọi quyết định ghi vào
     `artifacts/retrain_history.jsonl`.

→ Đảm bảo retrain chỉ làm model TỐT lên hoặc giữ nguyên, KHÔNG bao giờ để
   concept drift / feedback loop / data 1 ngày xấu làm hỏng model đang chạy.

Cách dùng:
  python retrain_guard.py                          # đọc QMS_DA, tự quyết
  python retrain_guard.py --min-samples 200 --margin 0.02
  python retrain_guard.py --source csv --data data/wait_time_samples.csv --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

try:
    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error
except ImportError as exc:
    print(f"Thiếu dependency: {exc}. Chạy: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

# Console Windows mặc định cp1258 → vỡ khi print tiếng Việt / mũi tên '→'.
# Ép stdout/stderr về UTF-8 (an toàn trên mọi OS).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


# Khớp đúng FEATURES + LABEL của train.py để serve.py load lại không lệch cột.
FEATURES = [
    "queueLen", "queueType", "phongBanId", "priorityLevel",
    "hourOfDay", "dayOfWeek",
]
LABEL = "waitMinutes"

DEFAULT_CONN = os.environ.get(
    "QMS_CONN",
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost\\SQLEXPRESS;Database=QMS_DA;"
    "Trusted_Connection=yes;TrustServerCertificate=yes;",
)

# Data thật đã có nhãn. hourOfDay/dayOfWeek lấy từ NgayGioLaySo (giờ local) để
# khớp feature lúc train — KHÔNG dùng CreatedAt (UTC) của log. dayOfWeek tính
# bằng DATEDIFF từ 1900-01-01 (thứ Hai) % 7 → Mon=0..Sun=6, độc lập DATEFIRST,
# khớp pandas .dt.dayofweek. takeTime để chia tập theo thời gian.
SQL_REAL = r"""
SELECT
    w.QueueLen                                                  AS queueLen,
    w.HangDoi_Id                                                AS queueType,
    w.PhongBan_Id                                               AS phongBanId,
    ISNULL(w.LoaiUuTien_Id, 0)                                  AS priorityLevel,
    DATEPART(HOUR, TRY_CONVERT(datetime, h.NgayGioLaySo))       AS hourOfDay,
    DATEDIFF(DAY, '19000101',
             TRY_CONVERT(datetime, h.NgayGioLaySo)) % 7         AS dayOfWeek,
    w.ActualMinutes                                             AS waitMinutes,
    TRY_CONVERT(datetime, h.NgayGioLaySo)                       AS takeTime
FROM dbo.WaitEstimateLog w
JOIN dbo.HangDoiPhongBan h WITH (NOLOCK)
     ON h.HangDoiPhongBan_Id = w.HangDoiPhongBan_Id
WHERE w.ActualMinutes IS NOT NULL
  AND w.HangDoiPhongBan_Id IS NOT NULL
  AND w.PhongBan_Id IS NOT NULL
  AND w.ActualMinutes BETWEEN 1 AND 240
"""


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mape = float(np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100)
    over10 = float(np.mean(np.abs(y_true - y_pred) > 10) * 100)
    return {
        "MAE": round(mae, 2), "RMSE": round(rmse, 2),
        "MAPE": round(mape, 2), "over10minPct": round(over10, 2),
        "n": int(len(y_true)),
    }


def load_real_data(source: str, conn: str, csv_path: str) -> pd.DataFrame:
    if source == "csv":
        # Demo cơ chế khi WaitEstimateLog chưa có data vận hành: dùng lại CSV.
        # Lưu ý: champion đã từng "nhìn thấy" CSV này nên thường sẽ KHÔNG bị
        # challenger vượt — đó là minh hoạ guard từ chối retrain, vẫn hợp lệ.
        print("[source=csv] đọc lại data seed để demo cơ chế.", file=sys.stderr)
        return pd.read_csv(csv_path)

    try:
        import pyodbc
    except ImportError:
        print("Thiếu pyodbc cho --source db. Cài hoặc dùng --source csv.", file=sys.stderr)
        sys.exit(1)
    print("[source=db] kéo data thật đã có nhãn từ WaitEstimateLog...", file=sys.stderr)
    with pyodbc.connect(conn) as cn:
        return pd.read_sql(SQL_REAL, cn)


def train_challenger(Xtr: np.ndarray, ytr: np.ndarray):
    """Cùng công thức train.py: ưu tiên XGBoost, fallback RandomForest."""
    try:
        from xgboost import XGBRegressor

        m = XGBRegressor(
            n_estimators=400, max_depth=6, learning_rate=0.05,
            subsample=0.8, random_state=42, tree_method="hist",
        ).fit(Xtr, ytr)
        return "xgboost", m
    except ImportError:
        m = RandomForestRegressor(
            n_estimators=200, random_state=42, n_jobs=-1,
        ).fit(Xtr, ytr)
        return "random_forest", m


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["db", "csv"], default="db")
    ap.add_argument("--conn", default=DEFAULT_CONN)
    ap.add_argument("--data", default="data/wait_time_samples.csv")
    ap.add_argument("--out", default="artifacts")
    ap.add_argument("--min-samples", type=int, default=200,
                    help="Số dòng nhãn thật tối thiểu mới dám retrain.")
    ap.add_argument("--margin", type=float, default=0.0,
                    help="Challenger phải giảm MAE >= margin*champion_MAE mới "
                         "được promote (vd 0.02 = phải tốt hơn >=2%).")
    ap.add_argument("--dry-run", action="store_true",
                    help="Đánh giá + ghi history nhưng KHÔNG ghi đè model.")
    args = ap.parse_args()

    art = Path(args.out)
    art.mkdir(parents=True, exist_ok=True)

    # 1) Data thật ----------------------------------------------------------
    df = load_real_data(args.source, args.conn, args.data)
    df = df.dropna(subset=FEATURES + [LABEL])
    n = len(df)
    if n < args.min_samples:
        print(f"Chỉ có {n} mẫu nhãn thật (< min-samples={args.min_samples}). "
              f"BỎ QUA retrain — giữ champion.", file=sys.stderr)
        _append_history(art, dict(n=n, decision="skip-too-few", promoted=False))
        return 0

    # Chia theo THỜI GIAN (giống train.py): 80% mốc sớm train, 20% muộn test.
    if "takeTime" in df.columns:
        df = df.sort_values("takeTime")
    X = df[FEATURES].to_numpy()
    y = df[LABEL].to_numpy(dtype=np.float32)
    split = int(len(X) * 0.8)
    Xtr, Xte, ytr, yte = X[:split], X[split:], y[:split], y[split:]

    # 2) Champion: đo lại trên CÙNG tập test thật --------------------------
    champ_mae = None
    champ_path = art / "model.pkl"
    if champ_path.exists():
        # FEATURES cố định & khớp features.pkl → Xte (theo thứ tự FEATURES)
        # dùng được trực tiếp cho champion.
        champ = joblib.load(champ_path)
        champ_metrics = metrics(yte, champ.predict(Xte))
        champ_mae = champ_metrics["MAE"]
    else:
        print("Chưa có champion (cold start) — sẽ nhận challenger nếu đủ mẫu.",
              file=sys.stderr)

    # 3) Challenger --------------------------------------------------------
    best_name, challenger = train_challenger(Xtr, ytr)
    chall_metrics = metrics(yte, challenger.predict(Xte))
    chall_mae = chall_metrics["MAE"]

    # 4) Quyết định --------------------------------------------------------
    if champ_mae is None:
        promote = True
        reason = "cold-start"
    else:
        threshold = champ_mae * (1.0 - args.margin)
        # Strictly nhỏ hơn: challenger BẰNG champion thì GIỮ champion (tránh
        # thay model "không tốt hơn" khi margin = 0).
        promote = chall_mae < threshold
        reason = (f"challenger {chall_mae} < champion {champ_mae} * "
                  f"(1-{args.margin}) = {round(threshold, 2)}")

    print("\n=== Champion–Challenger ===")
    print(f"  test n        : {len(yte)}")
    print(f"  champion MAE  : {champ_mae}")
    print(f"  challenger MAE: {chall_mae}  ({best_name})")
    print(f"  margin        : {args.margin}")
    print(f"  → {'PROMOTE challenger' if promote else 'GIỮ champion'} ({reason})")

    record = dict(
        n=n, test_n=len(yte), source=args.source,
        champion_mae=champ_mae, challenger_mae=chall_mae,
        challenger_model=best_name, margin=args.margin,
        promoted=bool(promote), dry_run=bool(args.dry_run),
        challenger_metrics=chall_metrics,
    )

    # 5) Ghi đè (nếu promote và không dry-run) ------------------------------
    if promote and not args.dry_run:
        _backup(art)
        joblib.dump(challenger, art / "model.pkl")
        joblib.dump(FEATURES, art / "features.pkl")
        with open(art / "meta.json", "w", encoding="utf-8") as f:
            json.dump({"best": best_name, "mae": chall_mae,
                       "rmse": chall_metrics["RMSE"]}, f, indent=2, ensure_ascii=False)
        with open(art / "report.json", "w", encoding="utf-8") as f:
            json.dump({"best": best_name, "source": "real-data-retrain",
                       "metrics": {best_name: chall_metrics,
                                   "champion_on_same_test": {"MAE": champ_mae}}},
                      f, indent=2, ensure_ascii=False)
        print("  Đã ghi model mới. serve.py sẽ load khi restart "
              "(hoặc gọi reload).")
    elif promote and args.dry_run:
        print("  [dry-run] đủ điều kiện promote nhưng KHÔNG ghi đè.")

    _append_history(art, record)
    return 0


def _backup(art: Path) -> None:
    """Sao lưu champion trước khi đè để có thể rollback tay."""
    for name in ("model.pkl", "features.pkl", "meta.json", "report.json"):
        src = art / name
        if src.exists():
            shutil.copy2(src, art / (src.stem + ".prev" + src.suffix))


def _append_history(art: Path, record: dict) -> None:
    """Append-only log mọi lần chạy guard — dùng vẽ biểu đồ MAE theo thời gian
    cho báo cáo, và để chứng minh retrain CÓ kiểm soát."""
    record = {"ts": datetime.now().isoformat(timespec="seconds"), **record}
    with open(art / "retrain_history.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
