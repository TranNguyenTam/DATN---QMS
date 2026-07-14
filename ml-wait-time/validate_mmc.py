"""
validate_mmc.py — Tầng A: kiểm chứng model dự báo thời gian chờ bằng LÝ THUYẾT
HÀNG ĐỢI M/M/c (Erlang-C). KHÔNG cần dataset ngoài, chạy trong vài giây.

Ý tưởng: dự báo thời gian chờ bản chất là bài toán hàng đợi. Lý thuyết M/M/c
cho "chân lý toán học" độc lập với data train: với c quầy, mỗi quầy phục vụ
trung bình `svc` phút (tốc độ μ = 1/svc), một BN đến thấy q người trong hệ
thống sẽ chờ kỳ vọng:

        Wq(q) = max(0, q − c + 1) · svc / c          (phút)

(exact cho M/M/c nhờ tính vô nhớ của phân phối mũ: phải chờ (q−c+1) lượt hoàn
tất trên c quầy, mỗi lượt tốn 1/(c·μ) = svc/c phút).

Script nạp MODEL THẬT (`artifacts/model.pkl`) và so đường cong wait–vs–queueLen
mà model dự báo với đường analytical M/M/c, cho từng hàng đợi (tham số c/svc
khớp `database/setup/42_seed_synthetic_history.sql`). Model bám sát lý thuyết
(tương quan cao) → đã học ĐÚNG quy luật hàng đợi, không phải nhớ vẹt data.

Bổ sung: in P_wait + Wq steady-state (công thức Erlang-C đầy đủ) làm tham chiếu.

Xuất: report_mmc.json + mmc_curve.csv (vẽ hình "Model vs M/M/c" cho báo cáo).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import joblib
    import numpy as np
except ImportError as exc:
    print(f"Thiếu dependency: {exc}. Chạy: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Cấu hình 7 hàng đợi — KHỚP 42_seed_synthetic_history.sql.
# (HangDoi_Id, PhongBan_Id, c=servers, svc_min, tên)
QUEUES = [
    (3,  2, 3, 10.0, "Khám bệnh"),
    (4,  8, 2,  4.0, "Thanh toán viện phí"),
    (5,  9, 2,  5.0, "Phát thuốc BHYT"),
    (6,  5, 2,  3.0, "Lấy mẫu xét nghiệm"),
    (7,  6, 1, 15.0, "Siêu âm ổ bụng"),
    (8,  7, 1,  8.0, "X-Quang phổi"),
    (10, 10, 1, 20.0, "CT-Scanner"),
]

# Trung bình hoá dự báo model qua các giờ làm việc để KHỬ ảnh hưởng peak-factor,
# cô lập đúng quan hệ wait–queueLen đem so với M/M/c.
HOURS = list(range(7, 18))


def analytical_wq(q: int, c: int, svc_min: float) -> float:
    """M/M/c: BN đến thấy q người trong hệ thống → Wq = max(0,q−c+1)·svc/c phút."""
    return max(0.0, q - c + 1) * svc_min / c


def erlang_b(c: int, a: float) -> float:
    """Erlang-B đệ quy ổn định số học. a = offered load (Erlang)."""
    B = 1.0
    for k in range(1, c + 1):
        B = (a * B) / (k + a * B)
    return B


def erlang_c(c: int, a: float) -> float:
    """Xác suất phải chờ (mọi quầy bận). a = λ/μ. a≥c → hệ quá tải → luôn chờ."""
    if a >= c:
        return 1.0
    B = erlang_b(c, a)
    return B / (1 - (a / c) * (1 - B))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", default="artifacts")
    ap.add_argument("--qmax", type=int, default=30, help="queueLen tối đa khi quét")
    ap.add_argument("--rho", type=float, default=0.85,
                    help="độ tải ρ cho tham chiếu Erlang-C steady-state")
    ap.add_argument("--out", default="report_mmc.json")
    args = ap.parse_args()

    art = Path(args.artifacts)
    try:
        model = joblib.load(art / "model.pkl")
        features = joblib.load(art / "features.pkl")  # thứ tự cột model mong đợi
    except Exception as exc:
        print(f"Không nạp được model ({exc}). Chạy train.py trước.", file=sys.stderr)
        return 1

    def model_curve(hangdoi: int, phongban: int, q: int) -> float:
        """Dự báo model cho queueLen=q, trung bình qua HOURS, priority=0."""
        preds = []
        for h in HOURS:
            feat = {"queueLen": q, "queueType": hangdoi, "phongBanId": phongban,
                    "priorityLevel": 0, "hourOfDay": h, "dayOfWeek": 2}
            x = np.array([[feat[k] for k in features]], dtype=np.float32)
            preds.append(float(model.predict(x)[0]))
        return max(0.0, float(np.mean(preds)))

    qs = list(range(0, args.qmax + 1))
    report: dict = {"model": type(model).__name__, "rho_ref": args.rho, "queues": {}}
    csv_rows = ["queue,servers,svc_min,queueLen,analytical_wq_min,model_pred_min"]
    all_corr, all_mae = [], []

    print("\n══════ Tầng A — Kiểm chứng MODEL vs lý thuyết hàng đợi M/M/c ══════")
    print(f"Model = {type(model).__name__} | quét queueLen 0..{args.qmax} "
          f"| dự báo trung bình qua giờ {HOURS[0]}–{HOURS[-1]}h\n")
    print(f"{'Hàng đợi':<22}{'c':>2}{'svc':>5}{'corr':>8}{'MAE(min)':>10}"
          f"{'P_wait':>8}{'Wq_ss':>8}")
    print("  " + "-" * 60)

    for hangdoi, phongban, c, svc, name in QUEUES:
        ana = np.array([analytical_wq(q, c, svc) for q in qs])
        mdl = np.array([model_curve(hangdoi, phongban, q) for q in qs])

        corr = float(np.corrcoef(ana, mdl)[0, 1]) if np.std(mdl) > 1e-9 else 0.0
        mae = float(np.mean(np.abs(ana - mdl)))

        # Tham chiếu steady-state Erlang-C tại ρ.
        mu = 1.0 / svc                     # phút^-1
        lam = args.rho * c * mu
        a = lam / mu                       # = ρ·c
        pw = erlang_c(c, a)
        denom = c * mu - lam
        wq_ss = pw / denom if denom > 0 else float("inf")

        report["queues"][name] = {
            "servers": c, "svc_min": svc,
            "corr_model_vs_mmc": round(corr, 3),
            "mae_model_vs_mmc_min": round(mae, 2),
            "erlang_c_pwait_at_rho": round(pw, 3),
            "wq_steadystate_min_at_rho": round(wq_ss, 2),
        }
        all_corr.append(corr)
        all_mae.append(mae)
        for q, av, mv in zip(qs, ana, mdl):
            csv_rows.append(f"{name},{c},{svc},{q},{av:.2f},{mv:.2f}")

        print(f"{name:<22}{c:>2}{svc:>5.0f}{corr:>8.3f}{mae:>10.2f}{pw:>8.3f}{wq_ss:>8.1f}")

    report["overall"] = {
        "mean_corr": round(float(np.mean(all_corr)), 3),
        "mean_mae_min": round(float(np.mean(all_mae)), 2),
    }
    mc = report["overall"]["mean_corr"]
    print("  " + "-" * 60)
    print(f"  TỔNG: tương quan TB = {mc}  |  MAE TB = {report['overall']['mean_mae_min']} phút")
    if mc >= 0.9:
        print("  → ✓ Model BÁM SÁT M/M/c → đã học đúng quy luật hàng đợi (độc lập data seed).")
    elif mc >= 0.7:
        print("  → ◐ Model bám lý thuyết ở mức khá — xem mmc_curve.csv để phân tích lệch.")
    else:
        print("  → △ Model lệch lý thuyết — kiểm tra lại đặc trưng/đào tạo.")

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    Path("mmc_curve.csv").write_text("\n".join(csv_rows), encoding="utf-8")
    print(f"\nĐã ghi {args.out} + mmc_curve.csv (dùng vẽ hình Model vs M/M/c cho báo cáo).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
