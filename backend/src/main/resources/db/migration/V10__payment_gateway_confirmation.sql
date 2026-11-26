ALTER TABLE payments
  DROP CHECK ck_payments_state,
  ADD CONSTRAINT ck_payments_state CHECK (
    (status = 'UNPAID' AND confirmed_by IS NULL AND confirmed_at IS NULL
      AND confirmation_key IS NULL AND reference IS NULL)
    OR
    (status = 'PAID' AND confirmed_at IS NOT NULL AND confirmation_key IS NOT NULL
      AND CHAR_LENGTH(confirmation_key) > 0
      AND (confirmed_by IS NOT NULL
        OR (method = 'QR_TRANSFER' AND confirmation_key LIKE 'SEPAY:%')
        OR (method = 'VNPAY' AND confirmation_key LIKE 'VNPAY:%')))
  );
