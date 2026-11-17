import type { AuditLogPage, Dashboard, EmployeeListQuery, EmployeePage, Filters, Lookups, PersonalDashboard } from '../types/api';
import { isAuditLogPage, isDashboard, isEmployeePage, isLookups, isPersonalDashboard } from './guards';
import { getJson } from './httpClient';

const filterParams = (f: Filters) => ({
  departmentId: f.departmentId === 'All' ? undefined : f.departmentId,
  location: f.location === 'All' ? undefined : f.location,
  status: f.status === 'All' ? undefined : f.status,
});

export const api = {
  getDashboard: (f: Filters, signal?: AbortSignal): Promise<Dashboard> =>
    getJson('/dashboard', { from: f.from, to: f.to, ...filterParams(f) }, isDashboard, signal),

  getPersonalDashboard: (from: string, to: string, signal?: AbortSignal): Promise<PersonalDashboard> =>
    getJson('/me/overview', { from, to }, isPersonalDashboard, signal),

  getEmployees: (f: Filters, q: EmployeeListQuery, signal?: AbortSignal): Promise<EmployeePage> =>
    getJson('/employees', { ...filterParams(f), ...q, search: q.search.trim() || undefined }, isEmployeePage, signal),

  getLookups: (signal?: AbortSignal): Promise<Lookups> => getJson('/lookups', {}, isLookups, signal),

  getAuditLogs: (signal?: AbortSignal): Promise<AuditLogPage> =>
    getJson('/audit-logs', { limit: 50, page: 1 }, isAuditLogPage, signal),
};
