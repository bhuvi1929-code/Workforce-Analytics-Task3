import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../app';
import { buildServices } from '../container';
import { openDatabase } from '../db/connection';
import { seedDatabase } from '../db/seed';

async function addAccount(
  db: ReturnType<typeof openDatabase>,
  email: string,
  roleName: string,
  employeeId: number | null = null,
): Promise<void> {
  const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as { id: number };
  const departmentId = employeeId
    ? (db.prepare('SELECT department_id FROM employees WHERE id = ?').get(employeeId) as { department_id: number }).department_id
    : null;
  const passwordHash = await bcrypt.hash('Integration-Test-Password-123!', 4);
  const userId = Number(db.prepare(`
    INSERT INTO users (employee_id, department_id, email, password_hash, full_name, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(employeeId, departmentId, email, passwordHash, roleName).lastInsertRowid);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
}

test('HTTP API enforces authentication, role portals and employee self scope', async (t) => {
  const db = openDatabase(':memory:');
  seedDatabase(db, '2026-11-17');
  await addAccount(db, 'api-admin@example.test', 'Admin');
  await addAccount(db, 'api-employee@example.test', 'Employee', 1);

  const server = createApp(buildServices(db)).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}/api`;

  const unauthenticated = await fetch(`${base}/employees`);
  assert.equal(unauthenticated.status, 401);

  const wrongPortal = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'api-admin@example.test', password: 'Integration-Test-Password-123!', expectedRole: 'HR' }),
  });
  assert.equal(wrongPortal.status, 403);

  const employeeLogin = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'api-employee@example.test', password: 'Integration-Test-Password-123!', expectedRole: 'Employee' }),
  });
  assert.equal(employeeLogin.status, 200);
  const employeeBody = await employeeLogin.json() as { accessToken: string };
  const employeeHeaders = { Authorization: `Bearer ${employeeBody.accessToken}` };

  const employeeRows = await fetch(`${base}/employees`, { headers: employeeHeaders });
  assert.equal(employeeRows.status, 200);
  const page = await employeeRows.json() as { total: number; items: Array<{ id: number }> };
  assert.equal(page.total, 1);
  assert.equal(page.items[0]?.id, 1);

  const personalDashboard = await fetch(`${base}/me/overview`, { headers: employeeHeaders });
  assert.equal(personalDashboard.status, 200);

  const forbiddenOrgDashboard = await fetch(`${base}/dashboard`, { headers: employeeHeaders });
  assert.equal(forbiddenOrgDashboard.status, 403);
});
