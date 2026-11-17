
import type { Db } from './db/connection';
import type { Services } from './routes/api';

import { SqliteAttendanceRepository } from './repositories/SqliteAttendanceRepository';
import { SqliteDepartmentRepository } from './repositories/SqliteDepartmentRepository';
import { SqliteEmployeeRepository } from './repositories/SqliteEmployeeRepository';
import { AuthRepository } from './repositories/AuthRepository';

import { DashboardService } from './services/DashboardService';
import { EmployeeService } from './services/EmployeeService';
import { LookupService } from './services/LookupService';
import { AuthService } from './services/AuthService';

/** Composition root: connects database repositories and application services. */
export function buildServices(db: Db): Services {
  const employees = new SqliteEmployeeRepository(db);
  const departments = new SqliteDepartmentRepository(db);
  const attendance = new SqliteAttendanceRepository(db);

  const authRepository = new AuthRepository(db);

  return {
    dashboard: new DashboardService(employees, attendance),
    employees: new EmployeeService(employees),
    lookups: new LookupService(departments, employees),
    auth: new AuthService(authRepository),
  };
}
