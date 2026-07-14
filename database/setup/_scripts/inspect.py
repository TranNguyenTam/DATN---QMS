"""Inspect schema of source tables to plan clone.
Credentials đọc từ env: SRC_DB_SERVER, SRC_DB_USER, SRC_DB_PASS."""
import os
import pyodbc

_SRV = os.environ.get("SRC_DB_SERVER", "")
_USR = os.environ.get("SRC_DB_USER", "")
_PWD = os.environ.get("SRC_DB_PASS", "")

SRC_QMS = pyodbc.connect(
    f"Driver={{ODBC Driver 17 for SQL Server}};Server={_SRV};"
    f"Database=K_QMS_YHCT;UID={_USR};PWD={_PWD};TrustServerCertificate=yes",
    timeout=15,
)
SRC_HIS = pyodbc.connect(
    f"Driver={{ODBC Driver 17 for SQL Server}};Server={_SRV};"
    f"Database=PRODUCT_HIS;UID={_USR};PWD={_PWD};TrustServerCertificate=yes",
    timeout=15,
)


def cols(conn, table):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        """,
        table,
    )
    return cur.fetchall()


def count(conn, table):
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT COUNT(*) FROM dbo.{table}")
        return cur.fetchone()[0]
    except Exception as e:
        return f"ERR: {e}"


qms_tables = [
    "DM_HangDoi",
    "DM_PhongBan",
    "Sys_Users",
    "Sys_Users_PhongBan",
    "Menu",
    "Permission",
    "DM_NoiDungDacBiet",
    "DM_ThoiGianDichVu",
    "K_DM_DoiTuongUuTien",
]
his_tables = ["TM_LOAIDICHVU", "TM_NHOMDICHVU", "TM_DICHVU", "TT_BENHNHAN", "TT_BENHNHAN_BHYT"]

print("=" * 70)
print("K_QMS_YHCT tables")
print("=" * 70)
for t in qms_tables:
    print(f"\n--- {t} (count={count(SRC_QMS, t)}) ---")
    for c in cols(SRC_QMS, t):
        print(f"  {c[0]:30s} {c[1]:15s} len={c[2]} null={c[3]}")

print("\n" + "=" * 70)
print("PRODUCT_HIS tables")
print("=" * 70)
for t in his_tables:
    print(f"\n--- {t} (count={count(SRC_HIS, t)}) ---")
    for c in cols(SRC_HIS, t):
        print(f"  {c[0]:30s} {c[1]:15s} len={c[2]} null={c[3]}")
