import { describe, expect, it } from 'vitest';
import { isAuditLogPage, isDashboard, isEmployeePage, isPersonalDashboard } from './guards';

const dash = {
  asOf: '2026-10-30',
  kpis: { total: 10, present: 8, absent: 1, onLeave: 1, attendanceRate: 88.9 },
  trend: [{ date: '2026-10-30', present: 8, absent: 1, onLeave: 1 }],
  byDepartment: [{ label: 'HR', value: 10 }], byLocation: [], byStatus: [],
  recentActivity: [],
};

const personal = {
  employee: null,
  summary: { totalDays: 0, present: 0, absent: 0, onLeave: 0, attendanceRate: 0 },
  attendance: [],
};

const audit = {
  items: [{ id: 1, user_id: 2, event_type: 'LOGIN_SUCCESS', ip_address: '127.0.0.1', user_agent: 'test', details: null, created_at: '2026-11-17 10:00:00' }],
  page: 1,
  pageSize: 50,
};

describe('response guards', () => {
  it('accepts a valid dashboard payload', () => expect(isDashboard(dash)).toBe(true));
  it('rejects a wrong KPI type', () => expect(isDashboard({ ...dash, kpis: { ...dash.kpis, total: '10' } })).toBe(false));
  it('rejects null and arrays', () => { expect(isDashboard(null)).toBe(false); expect(isEmployeePage([])).toBe(false); });
  it('accepts an empty employee page', () => expect(isEmployeePage({ items: [], total: 0, page: 1, pageSize: 10 })).toBe(true));
  it('accepts an employee personal dashboard', () => expect(isPersonalDashboard(personal)).toBe(true));
  it('rejects malformed personal attendance rows', () => expect(isPersonalDashboard({ ...personal, attendance: [{ id: '1' }] })).toBe(false));
  it('accepts audit log pages', () => expect(isAuditLogPage(audit)).toBe(true));
});
