"""
validate_face.py — Kiểm chứng ĐIỂM VẬN HÀNH của module nhận diện khuôn mặt 1:N.

KHÔNG kiểm chứng "độ chính xác Facenet512" (đã có benchmark LFW ~99.6% công khai,
chỉ cần trích dẫn). Script này đo cái HỘI ĐỒNG sẽ hỏi về CHECK-IN CỦA BẠN:

  - FRR (False Reject Rate)  : đúng BN mà KHÔNG nhận ra (bắt nhập tay) — phiền.
  - FAR (False Accept Rate)  : người LẠ bị nhận nhầm thành BN — NGUY HIỂM.
  - Rank-1 identification rate: top-1 có đúng người không.
  - EER + ngưỡng tối ưu      : ngưỡng cosine nên đặt là bao nhiêu.

Mô phỏng đúng pipeline production (app.py): Facenet512 qua DeepFace, detector
'opencv', embedding chuẩn hoá, so khớp bằng cosine. Ngưỡng vận hành mặc định
0.6 (khớp MATCH_THRESHOLD=0.4 → recognized khi cosine ≥ 0.6).

─── Chuẩn bị dữ liệu ───────────────────────────────────────────────────────
Thư mục ảnh tổ chức theo NGƯỜI (mỗi người ≥ enroll+1 ảnh):

    faces_eval/
        benhnhan_A/   a1.jpg  a2.jpg  a3.jpg
        benhnhan_B/   b1.jpg  b2.jpg
        ...

Nên thu dưới CHÍNH điều kiện camera kiosk (ánh sáng/góc/khoảng cách) để số
FAR/FRR phản ánh đúng lúc triển khai. ~10–30 người là đủ cho đồ án.

Cách dùng:
    python validate_face.py --data faces_eval
    python validate_face.py --data faces_eval --enroll 2 --threshold 0.6
    python validate_face.py --data crops --detector skip --no-enforce   # ảnh đã cắt sẵn mặt

Xuất: report_face.json + face_roc.csv (vẽ đường ROC/FAR-FRR cho báo cáo).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError as exc:
    print(f"Thiếu dependency: {exc}", file=sys.stderr)
    sys.exit(1)

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".heic"}


def embed_file(path: Path, detector: str, enforce: bool):
    """Trích embedding Facenet512 (chuẩn hoá) — KHỚP app.py._embed.
    Trả None nếu không phát hiện mặt / lỗi (sẽ bỏ qua ảnh đó)."""
    from deepface import DeepFace  # import lazy: test logic không cần DeepFace

    try:
        rep = DeepFace.represent(
            img_path=str(path), model_name="Facenet512",
            detector_backend=detector, enforce_detection=enforce, align=True,
        )
        v = np.asarray(rep[0]["embedding"], dtype=np.float32)
        return v / (np.linalg.norm(v) + 1e-9)
    except Exception as exc:  # noqa: BLE001
        print(f"  ⚠ bỏ qua {path.name}: {type(exc).__name__} "
              f"(không thấy mặt? thử --detector skip --no-enforce)", file=sys.stderr)
        return None


def load_embeddings(data_dir: Path, detector: str, enforce: bool) -> dict:
    """Quét thư mục theo người → {identity: [emb, ...]}."""
    persons = sorted([d for d in data_dir.iterdir() if d.is_dir()])
    if not persons:
        print(f"Không thấy thư mục con (người) trong {data_dir}. Xem cấu trúc ở docstring.",
              file=sys.stderr)
        sys.exit(1)
    embs: dict = {}
    for p in persons:
        imgs = [f for f in sorted(p.iterdir()) if f.suffix.lower() in IMG_EXT]
        vecs = [v for v in (embed_file(f, detector, enforce) for f in imgs) if v is not None]
        if vecs:
            embs[p.name] = vecs
        print(f"  {p.name}: {len(vecs)}/{len(imgs)} ảnh có embedding", file=sys.stderr)
    return embs


def split_gallery_probe(embs: dict, enroll: int):
    """Mỗi người: `enroll` ảnh đầu → gallery (đã đăng ký), còn lại → probe (đến check-in)."""
    gallery, probes = {}, []
    skipped = []
    for ident, vecs in embs.items():
        if len(vecs) < enroll + 1:
            skipped.append(ident)
            continue
        gallery[ident] = np.vstack(vecs[:enroll])
        for v in vecs[enroll:]:
            probes.append((ident, v))
    return gallery, probes, skipped


def evaluate(gallery: dict, probes: list, thresholds: np.ndarray, t0: float):
    """Tính genuine/impostor score, FAR/FRR theo ngưỡng, rank-1, EER. PURE numpy."""
    ids = list(gallery.keys())
    genuine, impostor, rank1 = [], [], 0
    for true_id, emb in probes:
        # cosine = dot (vector đã chuẩn hoá). best score tới gallery từng người.
        best = {i: float(np.max(gallery[i] @ emb)) for i in ids}
        pred = max(best, key=best.get)               # 1:N top-1
        if pred == true_id:
            rank1 += 1
        if true_id in best:
            genuine.append(best[true_id])            # so với chính mình
        for i in ids:
            if i != true_id:
                impostor.append(best[i])             # so với người khác

    genuine, impostor = np.array(genuine), np.array(impostor)
    far = np.array([float(np.mean(impostor >= t)) for t in thresholds])
    frr = np.array([float(np.mean(genuine < t)) for t in thresholds])

    k = int(np.argmin(np.abs(far - frr)))            # EER: nơi FAR≈FRR
    far0 = float(np.mean(impostor >= t0))
    frr0 = float(np.mean(genuine < t0))

    metrics = {
        "n_identities": len(ids), "n_probes": len(probes),
        "n_genuine_pairs": int(len(genuine)), "n_impostor_pairs": int(len(impostor)),
        "rank1_rate": round(rank1 / len(probes), 4) if probes else 0.0,
        "operating_threshold": t0,
        "TAR_at_op": round(1 - frr0, 4), "FRR_at_op": round(frr0, 4), "FAR_at_op": round(far0, 4),
        "EER": round(float((far[k] + frr[k]) / 2), 4), "EER_threshold": round(float(thresholds[k]), 3),
        "genuine_mean": round(float(genuine.mean()), 4) if len(genuine) else None,
        "genuine_min": round(float(genuine.min()), 4) if len(genuine) else None,
        "impostor_mean": round(float(impostor.mean()), 4) if len(impostor) else None,
        "impostor_max": round(float(impostor.max()), 4) if len(impostor) else None,
    }
    return metrics, far, frr


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="thư mục ảnh theo người (xem docstring)")
    ap.add_argument("--enroll", type=int, default=2, help="số ảnh/người đưa vào gallery")
    ap.add_argument("--threshold", type=float, default=0.6, help="ngưỡng cosine vận hành")
    ap.add_argument("--detector", default="opencv", help="detector_backend ('skip' nếu ảnh đã cắt mặt)")
    ap.add_argument("--no-enforce", action="store_true", help="enforce_detection=False")
    ap.add_argument("--out", default="report_face.json")
    args = ap.parse_args()

    data = Path(args.data)
    if not data.is_dir():
        print(f"Không thấy thư mục {data}", file=sys.stderr)
        return 1

    print(f"Trích embedding Facenet512 từ {data} ...", file=sys.stderr)
    embs = load_embeddings(data, args.detector, not args.no_enforce)
    gallery, probes, skipped = split_gallery_probe(embs, args.enroll)

    if len(gallery) < 2:
        print(f"Cần ≥2 người, mỗi người ≥{args.enroll + 1} ảnh. Hiện chỉ {len(gallery)} người đủ điều kiện.",
              file=sys.stderr)
        return 1
    if skipped:
        print(f"  (bỏ qua {len(skipped)} người thiếu ảnh: {', '.join(skipped)})", file=sys.stderr)

    thresholds = np.linspace(0.20, 0.95, 76)
    m, far, frr = evaluate(gallery, probes, thresholds, args.threshold)

    # Ngưỡng đạt FAR mục tiêu (an toàn check-in) → TAR tương ứng.
    targets = {}
    for tgt in (0.01, 0.001):
        ok = np.where(far <= tgt)[0]
        if len(ok):
            i = ok[0]
            targets[f"FAR<={tgt}"] = {"threshold": round(float(thresholds[i]), 3),
                                       "TAR": round(1 - float(frr[i]), 4)}

    report = {**m, "tar_at_far_targets": targets}

    print("\n═══════════ KẾT QUẢ FAR/FRR — NHẬN DIỆN 1:N ═══════════")
    print(f"  {m['n_identities']} người | {m['n_probes']} lượt check-in thử "
          f"| gallery {args.enroll} ảnh/người")
    print(f"  Phân tách điểm: genuine TB={m['genuine_mean']} (min {m['genuine_min']})  "
          f"vs impostor TB={m['impostor_mean']} (max {m['impostor_max']})")
    print(f"\n  Rank-1 (top-1 đúng người): {m['rank1_rate']*100:.1f}%")
    print(f"  Tại ngưỡng vận hành {args.threshold}:")
    print(f"     TAR (nhận đúng) = {m['TAR_at_op']*100:.1f}%")
    print(f"     FRR (sót đúng)  = {m['FRR_at_op']*100:.1f}%")
    print(f"     FAR (nhận nhầm) = {m['FAR_at_op']*100:.2f}%   ← càng thấp càng an toàn")
    print(f"  EER = {m['EER']*100:.2f}% tại ngưỡng {m['EER_threshold']}")
    for k, v in targets.items():
        print(f"  Để {k}: đặt ngưỡng {v['threshold']} → TAR {v['TAR']*100:.1f}%")

    if m["FAR_at_op"] <= 0.01 and m["TAR_at_op"] >= 0.9:
        print("\n  → ✓ Điểm vận hành TỐT: nhận đúng cao, nhận nhầm thấp.")
    else:
        print("\n  → ◐ Xem face_roc.csv để chọn lại ngưỡng cân bằng FAR/FRR.")

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    csv = ["threshold,FAR,FRR,TAR"] + [f"{t:.3f},{f:.4f},{r:.4f},{1-r:.4f}"
                                       for t, f, r in zip(thresholds, far, frr)]
    Path("face_roc.csv").write_text("\n".join(csv), encoding="utf-8")
    print(f"\nĐã ghi {args.out} + face_roc.csv (vẽ đường ROC/FAR-FRR cho báo cáo).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
