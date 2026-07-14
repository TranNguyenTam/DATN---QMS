-- Bỏ ký tự đầu STT (KyTuSTT) cho mọi hàng đợi → STT hiển thị bắt đầu từ 001.
-- SP_002_HangDoiPhongBan build SoThuTuDayDu = isnull(KyTuSTT,'') + zeropad(STT,3),
-- nên KyTuSTT = '' → "001", "002", ... cho tất cả hàng đợi.
UPDATE dbo.DM_HangDoi
SET KyTuSTT = N''
WHERE ISNULL(KyTuSTT, N'') <> N'';

-- Đồng bộ các lượt ĐÃ tạo hôm nay: SoThuTuDayDu = STT zero-pad 3 chữ số, bỏ prefix.
UPDATE dbo.HangDoiPhongBan
SET SoThuTuDayDu = REPLICATE('0', CASE WHEN 3 - LEN(CAST(STT AS varchar(10))) > 0
                                       THEN 3 - LEN(CAST(STT AS varchar(10))) ELSE 0 END)
                  + CAST(STT AS varchar(10))
WHERE CONVERT(date, NgayThucHien) = CONVERT(date, GETDATE())
  AND STT IS NOT NULL;
