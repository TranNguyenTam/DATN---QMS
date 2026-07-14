# ml-wait-time

Module dự báo thời gian chờ — **tầng 2** theo đề cương (tầng 1 là EWMA + Weighted
Queue Length, đã hiện thực trong `backend/Qms.API/Services/WaitTimeEstimator.cs`).

Chạy ở port **5011**.

## Quy trình

```
export_data.py → data/wait_time_samples.csv
train.py       → artifacts/{model.pkl, features.pkl, report.json}
serve.py       → /predict (FastAPI, gọi từ BE C# WaitTimeEstimator)
```

## Cách dùng

```bash
pip install -r requirements.txt

# 1) Export dữ liệu lịch sử từ SQL Server
python export_data.py --out data/wait_time_samples.csv

# 2) Train baseline + RF + XGBoost, in metric
python train.py --data data/wait_time_samples.csv --out artifacts

# 3) Serve inference
uvicorn serve:app --host 0.0.0.0 --port 5011
```

## Hybrid ở backend

BE C# `WaitTimeEstimator` sẽ:
1. Gọi `POST http://ml-wait-time:5011/predict`.
2. Nếu lỗi HTTP hoặc `confidence < 0.6` → **fallback** về công thức rule-based
   (EWMA + weighted queue), log cả hai giá trị vào `WaitEstimateLog` để so sánh
   MAE theo thời gian thực.

## Feature cần cung cấp

Khớp với `export_data.py` / `train.py`:

| Feature | Kiểu | Nguồn |
|---|---|---|
| queueLen | int | `COUNT(*)` hàng đợi chưa hoàn tất tại thời điểm gọi |
| queueType | int | `HangDoi_Id` |
| phongBanId | int | `PhongBan_Id` |
| priorityLevel | int | `LoaiUuTien_Id` |
| hourOfDay | int | 0..23 |
| dayOfWeek | int | 0 (Mon) .. 6 |
