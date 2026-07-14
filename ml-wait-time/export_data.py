"""
Export dữ liệu vận hành từ SQL Server để train model dự báo thời gian chờ.

Theo PDF (mục 4 — Thuật toán dự báo), feature đầu vào gồm:
  - queueLen           Số BN đang chờ tại thời điểm lấy số
  - takeTime           Thời điểm lấy số
  - activeCounters     Số quầy/phòng đang active
  - completeTime       Thời điểm hoàn tất (dùng để tính label)
  - queueType          Loại hàng đợi
  - phongBanId         Phòng ban
  - priorityLevel      Mức ưu tiên
  - hourOfDay, dayOfWeek

Label = (completeTime - takeTime) tính theo phút.

Output: data/wait_time_samples.csv
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    import pandas as pd
    import pyodbc
except ImportError as exc:
    print(f"Thiếu dependency: {exc}. Chạy: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)


# Default: connect QMS_DA local. Override qua env QMS_CONN nếu cần dùng DB khác.
DEFAULT_CONN = os.environ.get(
    "QMS_CONN",
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost\\SQLEXPRESS;Database=QMS_DA;"
    "Trusted_Connection=yes;TrustServerCertificate=yes;",
)

SQL = r"""
SELECT
    hd.HangDoiPhongBan_Id                                   AS sampleId,
    hd.HangDoi_Id                                           AS queueType,
    hd.PhongBan_Id                                          AS phongBanId,
    ISNULL(hd.UuTien, 0)                                    AS priorityLevel,
    TRY_CONVERT(datetime, hd.NgayGioLaySo)                    AS takeTime,
    TRY_CONVERT(datetime, hd.NgayGioThucHien)               AS startTime,
    TRY_CONVERT(datetime, hd.NgayGioHoanTat)                AS completeTime,
    DATEDIFF(MINUTE,
             TRY_CONVERT(datetime, hd.NgayGioLaySo),
             TRY_CONVERT(datetime, hd.NgayGioHoanTat))      AS waitMinutes,
    (SELECT COUNT(*) FROM HangDoiPhongBan x WITH (NOLOCK)
     WHERE x.HangDoi_Id = hd.HangDoi_Id
       AND x.NgayGioLaySo <= hd.NgayGioLaySo
       AND (x.NgayGioHoanTat IS NULL
            OR TRY_CONVERT(datetime, x.NgayGioHoanTat) > TRY_CONVERT(datetime, hd.NgayGioLaySo))
       AND x.Huy = 0)                                       AS queueLen
FROM HangDoiPhongBan hd WITH (NOLOCK)
WHERE hd.Huy = 0
  AND hd.NgayGioLaySo IS NOT NULL
  AND hd.NgayGioHoanTat IS NOT NULL
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/wait_time_samples.csv")
    ap.add_argument("--conn", default=DEFAULT_CONN)
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    sql = SQL
    if args.limit > 0:
        sql = sql.replace("SELECT\n", f"SELECT TOP {args.limit}\n", 1)

    print(f"Connecting...", file=sys.stderr)
    with pyodbc.connect(args.conn) as conn:
        df = pd.read_sql(sql, conn)

    df["hourOfDay"] = df["takeTime"].dt.hour
    df["dayOfWeek"] = df["takeTime"].dt.dayofweek
    df = df[(df["waitMinutes"] > 0) & (df["waitMinutes"] < 240)]

    df.to_csv(out, index=False)
    print(f"Wrote {len(df):,} rows to {out}")
    print(df[["waitMinutes", "queueLen", "priorityLevel"]].describe().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
