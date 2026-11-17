
-- Task 3: Assign Manager and Team Lead users to departments

ALTER TABLE users
ADD COLUMN department_id INTEGER REFERENCES departments(id);

CREATE INDEX IF NOT EXISTS idx_users_department
ON users(department_id);
