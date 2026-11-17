-- Employee users can access only their own dashboard and attendance summary.
INSERT OR IGNORE INTO permissions (name, description)
VALUES ('dashboard:read_self', 'View personal attendance dashboard');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name = 'dashboard:read_self'
WHERE r.name = 'Employee';

-- Keep the newest factor if an earlier development build created duplicate rows.
DELETE FROM mfa_factors
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM mfa_factors GROUP BY user_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mfa_one_factor_per_user
ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_expiry
ON mfa_challenges(expires_at);
