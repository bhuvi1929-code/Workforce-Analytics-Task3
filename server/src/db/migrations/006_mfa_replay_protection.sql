-- Prevent reusing the same TOTP time-step for multiple verifications.
ALTER TABLE mfa_factors ADD COLUMN last_used_step INTEGER;
