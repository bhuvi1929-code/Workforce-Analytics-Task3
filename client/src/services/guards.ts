import type { AuditLogPage, Dashboard, EmployeePage, Lookups, PersonalDashboard } from '../types/api';

const rec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';
const every = (v: unknown, item: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(item);

const isDist = (x: unknown) => rec(x) && str(x.label) && num(x.value);
const isTrend = (t: unknown) => rec(t) && str(t.date) && num(t.present) && num(t.absent) && num(t.onLeave);
const isActivity = (a: unknown) => rec(a) && num(a.id) && str(a.employeeName) && str(a.department) && str(a.status) && str(a.date);
const isEmployee = (e: unknown) =>
  rec(e) && num(e.id) && str(e.code) && str(e.name) && str(e.email) && str(e.department) && str(e.location) && str(e.status) && str(e.joinedOn);
const isDept = (d: unknown) => rec(d) && num(d.id) && str(d.name);

export function isDashboard(v: unknown): v is Dashboard {
  if (!rec(v) || !rec(v.kpis)) return false;
  const k = v.kpis;
  return (
    (v.asOf === null || str(v.asOf)) &&
    ['total', 'present', 'absent', 'onLeave', 'attendanceRate'].every((n) => num(k[n])) &&
    every(v.trend, isTrend) && every(v.byDepartment, isDist) && every(v.byLocation, isDist) &&
    every(v.byStatus, isDist) && every(v.recentActivity, isActivity)
  );
}

export function isEmployeePage(v: unknown): v is EmployeePage {
  return rec(v) && num(v.total) && num(v.page) && num(v.pageSize) && every(v.items, isEmployee);
}

export function isLookups(v: unknown): v is Lookups {
  return rec(v) && every(v.departments, isDept) && every(v.locations, str) && every(v.statuses, str);
}

export function isPersonalDashboard(v: unknown): v is PersonalDashboard {
  if (!rec(v) || !rec(v.summary) || !Array.isArray(v.attendance)) return false;
  const s = v.summary;
  const employeeValid = v.employee === null || isEmployee(v.employee);
  return employeeValid &&
    num(s.totalDays) && num(s.present) && num(s.absent) && num(s.onLeave) && num(s.attendanceRate) &&
    every(v.attendance, (item) => rec(item) && num(item.id) && str(item.date) &&
      ['Present', 'Absent', 'On Leave'].includes(String(item.status)) &&
      (item.checkIn === null || str(item.checkIn)));
}

export function isAuditLogPage(v: unknown): v is AuditLogPage {
  return rec(v) && num(v.page) && num(v.pageSize) && every(v.items, (item) =>
    rec(item) && num(item.id) && (item.user_id === null || num(item.user_id)) &&
    str(item.event_type) && (item.ip_address === null || str(item.ip_address)) &&
    (item.user_agent === null || str(item.user_agent)) &&
    (item.details === null || str(item.details)) && str(item.created_at));
}
