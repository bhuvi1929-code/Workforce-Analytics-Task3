import { Router } from 'express';

import type { DashboardService } from '../services/DashboardService';
import type { EmployeeService } from '../services/EmployeeService';
import type { LookupService } from '../services/LookupService';
import type { AuthService, AuthenticatedUser } from '../services/AuthService';
import type { EmployeeAccessScope } from '../repositories/interfaces';

import { requireAuth, requirePermission } from './auth';
import { parseDashboardFilter, parseEmployeeQuery } from '../validation/filters';

export interface Services {
  dashboard: DashboardService;
  employees: EmployeeService;
  lookups: LookupService;
  auth: AuthService;
}

export function buildApiRouter(s: Services): Router {
  const r = Router();

  r.get('/health', (_req, res) => res.json({ status: 'ok' }));
  r.use(requireAuth(s.auth));

  r.get('/lookups', (_req, res) => res.json(s.lookups.get()));

  // Admin, HR, Manager and Team Lead workforce dashboards.
  r.get('/dashboard', requirePermission('dashboard:read'), (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    const parsed = parseDashboardFilter(req.query);

    // Department-scoped roles cannot widen their own department filter.
    if (
      !user.permissions.includes('employees:read_all') &&
      user.permissions.includes('employees:read_department')
    ) {
      if (!user.departmentId) {
        res.status(403).json({ error: { code: 'DEPARTMENT_NOT_ASSIGNED', message: 'Your account has no assigned department.' } });
        return;
      }
      parsed.departmentId = user.departmentId;
    }

    res.json(s.dashboard.getDashboard(parsed));
  });

  // Employee dashboard is scoped by the employee_id stored on the account.
  r.get('/me/overview', requirePermission('dashboard:read_self'), (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    if (!user.employeeId) {
      res.status(403).json({ error: { code: 'EMPLOYEE_NOT_LINKED', message: 'Your account is not linked to an employee record.' } });
      return;
    }
    const range = parseDashboardFilter(req.query);
    res.json(s.dashboard.getPersonalDashboard(user.employeeId, range));
  });

  r.get('/employees', (req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    let scope: EmployeeAccessScope | undefined;

    if (user.permissions.includes('employees:read_all')) {
      scope = undefined;
    } else if (user.permissions.includes('employees:read_department')) {
      if (!user.departmentId) {
        res.status(403).json({ error: { code: 'DEPARTMENT_NOT_ASSIGNED', message: 'Your account has no assigned department.' } });
        return;
      }
      scope = { type: 'department', departmentId: user.departmentId };
    } else if (user.permissions.includes('employees:read_self')) {
      if (!user.employeeId) {
        res.status(403).json({ error: { code: 'EMPLOYEE_NOT_LINKED', message: 'Your account is not linked to an employee record.' } });
        return;
      }
      scope = { type: 'self', employeeId: user.employeeId };
    } else {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You cannot access employee records.' } });
      return;
    }

    const query = parseEmployeeQuery(req.query);
    const result = s.employees.list(query, scope);
    res.json({ ...result, page: query.page, pageSize: query.pageSize });
  });

  r.get('/audit-logs', requirePermission('audit:read'), (req, res) => {
    const rawLimit = Number(req.query.limit ?? 50);
    const rawPage = Number(req.query.page ?? 1);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100 || !Number.isInteger(rawPage) || rawPage < 1) {
      res.status(400).json({ error: { code: 'INVALID_PAGINATION', message: 'limit must be 1–100 and page must be a positive integer.' } });
      return;
    }
    const logs = s.auth.getAuditLogs(rawLimit, (rawPage - 1) * rawLimit);
    res.json({ items: logs, page: rawPage, pageSize: rawLimit });
  });

  return r;
}
