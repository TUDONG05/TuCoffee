ALTER TABLE payments DROP CHECK ck_payments_method;
ALTER TABLE payments ADD CONSTRAINT ck_payments_method CHECK(method IN ('CASH','QR_TRANSFER','VNPAY'));

ALTER TABLE payments DROP CHECK ck_payments_bank;
ALTER TABLE payments ADD CONSTRAINT ck_payments_bank CHECK(
  (method='CASH' AND bank_code IS NULL AND reference IS NULL AND bank_account IS NULL AND bank_account_name IS NULL AND transfer_content IS NULL)
  OR (method='QR_TRANSFER' AND bank_code IS NOT NULL AND bank_account IS NOT NULL AND bank_account_name IS NOT NULL AND transfer_content IS NOT NULL AND (status='UNPAID' OR reference IS NOT NULL))
  OR (method='VNPAY' AND bank_account IS NULL AND bank_account_name IS NULL AND (status='UNPAID' OR reference IS NOT NULL))
);
