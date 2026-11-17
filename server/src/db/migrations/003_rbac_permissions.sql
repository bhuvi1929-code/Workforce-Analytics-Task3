
-- Task 3: Role-based permissions

INSERT OR IGNORE INTO permissions (name, description) VALUES
  ('dashboard:read', 'View workforce dashboard'),
  ('employees:read_all', 'View all employee records'),
  ('employees:read_department', 'View department employee records'),
  ('employees:read_self', 'View own employee record'),
  ('users:manage', 'Create, update and manage user accounts and roles'),
  ('audit:read', 'View system audit logs'),
  ('attendance:read_self', 'View own attendance records'),
  ('profile:read_self', 'View own profile');

-- Admin: Full access
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin';

-- HR: Dashboard, all employees and audit logs
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'dashboard:read',
  'employees:read_all',
  'audit:read',
  'profile:read_self'
)
WHERE r.name = 'HR';

-- Manager: Dashboard and department employees
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'dashboard:read',
  'employees:read_department',
  'profile:read_self'
)
WHERE r.name = 'Manager';

-- Team Lead: Dashboard and department employees
-- Team-level restrictions require a separate team relationship.
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'dashboard:read',
  'employees:read_department',
  'profile:read_self'
)
WHERE r.name = 'Team Lead';

-- Employee: Own profile and attendance only
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'employees:read_self',
  'attendance:read_self',
  'profile:read_self'
)
WHERE r.name = 'Employee';
