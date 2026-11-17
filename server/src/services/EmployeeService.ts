import type { EmployeeQuery, EmployeeRecord } from '../domain/types';
import type { EmployeeRepository } from '../repositories/interfaces';
import type { EmployeeAccessScope } from '../repositories/interfaces';

export interface EmployeePage { items: EmployeeRecord[]; total: number; page: number; pageSize: number }

export class EmployeeService {
  constructor(private readonly employees: EmployeeRepository) {}
  list(q: EmployeeQuery, scope?: EmployeeAccessScope) {
  return this.employees.search(q, scope);
}
}
