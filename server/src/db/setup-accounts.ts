import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { openDatabase } from './connection';
import { isEmpty, seedDatabase } from './seed';

const definitions = [
  { email: 'admin@thestackly.com', name: 'Admin User', role: 'Admin' },
  { email: 'hr@thestackly.com', name: 'HR User', role: 'HR' },
  { email: 'manager@thestackly.com', name: 'Manager User', role: 'Manager' },
  { email: 'teamlead@thestackly.com', name: 'Team Lead User', role: 'Team Lead' },
  { email: 'employee@thestackly.com', name: 'Employee User', role: 'Employee' },
] as const;

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const credentials: Array<(typeof definitions)[number] & { password: string }> = [];
  try {
    console.log('Create or update the five WFA demo accounts. Passwords are hashed with bcrypt before storage.');
    console.log('These are development/demo accounts. Use strong unique passwords in production.\n');
    for (const account of definitions) {
      const password = await rl.question(`${account.role} password for ${account.email}: `);
      if (password.length < 6 || password.length > 128) {
        throw new Error(`${account.role} password must contain between 6 and 128 characters.`);
      }
      credentials.push({ ...account, password });
    }
  } finally {
    rl.close();
  }

  const db = openDatabase(config.dbPath);
  try {
    if (isEmpty(db)) seedDatabase(db);
    const department = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get() as { id: number } | undefined;
    if (!department) throw new Error('No department exists. Database seeding failed.');

    const getRole = db.prepare('SELECT id FROM roles WHERE name = ?');
    const getUser = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE');
    const getEmployee = db.prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE');

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const account of credentials) {
        const role = getRole.get(account.role) as { id: number } | undefined;
        if (!role) throw new Error(`Role ${account.role} is missing. Check the database migrations.`);

        let employeeId: number | null = null;
        if (account.role === 'Employee') {
          db.prepare(`
            INSERT OR IGNORE INTO employees
              (code, name, email, department_id, location, status, joined_on)
            VALUES (?, ?, ?, ?, 'Chennai', 'Active', ?)
          `).run('WFA-LOGIN-EMPLOYEE', account.name, account.email, department.id, new Date().toISOString().slice(0, 10));
          const employee = getEmployee.get(account.email) as { id: number } | undefined;
          if (!employee) throw new Error('Could not create the Employee profile row.');
          employeeId = employee.id;
        }

        const departmentId = ['Manager', 'Team Lead', 'Employee'].includes(account.role) ? department.id : null;
        const passwordHash = await bcrypt.hash(account.password, 12);
        db.prepare(`
          INSERT INTO users
            (employee_id, department_id, email, password_hash, full_name, is_active,
             failed_login_attempts, locked_until, mfa_enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, 0, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(email) DO UPDATE SET
            employee_id = excluded.employee_id,
            department_id = excluded.department_id,
            password_hash = excluded.password_hash,
            full_name = excluded.full_name,
            is_active = 1,
            failed_login_attempts = 0,
            locked_until = NULL,
            mfa_enabled = 0,
            updated_at = CURRENT_TIMESTAMP
        `).run(employeeId, departmentId, account.email, passwordHash, account.name);

        const user = getUser.get(account.email) as { id: number } | undefined;
        if (!user) throw new Error(`Could not create user ${account.email}.`);
        // Re-provisioning a demo account resets its credentials and invalidates old sessions/MFA factors.
        db.prepare(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL`).run(user.id);
        db.prepare(`UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?) AND revoked_at IS NULL`).run(user.id);
        db.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM mfa_factors WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(user.id);
        db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(user.id, role.id);
        console.log(`Configured ${account.role}: ${account.email}`);
      }
      db.exec('COMMIT');
      console.log('\nAll five accounts are ready. No plaintext passwords were written to the database.');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Account setup failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
