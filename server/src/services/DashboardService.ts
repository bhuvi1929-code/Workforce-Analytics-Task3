import type { DashboardDto, DashboardFilter, PersonalDashboardDto } from '../domain/types';
import type { AttendanceRepository, EmployeeRepository } from '../repositories/interfaces';
import type { EmployeeAccessScope } from '../repositories/interfaces';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * KPI definitions:
 *  - total / present / absent / onLeave: snapshot on the latest day with attendance inside the range ("asOf")
 *  - attendanceRate: present / (present + absent) across the whole range (approved leave is excluded)
 */
export class DashboardService {
  constructor(private readonly employees: EmployeeRepository, private readonly attendance: AttendanceRepository) {}

  getDashboard(f: DashboardFilter): DashboardDto {
    const asOf = this.attendance.latestDate(f, f);
    const day = asOf ?? f.to;
    const counts = asOf ? this.attendance.counts(asOf, f) : { present: 0, absent: 0, onLeave: 0 };
    const totals = this.attendance.rangeTotals(f, f);
    const denominator = totals.present + totals.absent;

    return {
      asOf,
      kpis: {
        total: this.employees.countAsOf(f, day),
        ...counts,
        attendanceRate: denominator ? round1((totals.present / denominator) * 100) : 0,
      },
      trend: this.attendance.trend(f, f),
      byDepartment: this.employees.countBy('department', f, day),
      byLocation: this.employees.countBy('location', f, day),
      byStatus: this.employees.countBy('status', f, day),
      recentActivity: this.attendance.recent(f, f, 8),
    };
  }

  getPersonalDashboard(employeeId: number, range: { from: string; to: string }): PersonalDashboardDto {
    const scope: EmployeeAccessScope = { type: 'self', employeeId };
    const profile = this.employees.search(
      { sortBy: 'name', order: 'asc', page: 1, pageSize: 1 },
      scope,
    ).items[0] ?? null;
    const attendance = this.attendance.personalRecords(employeeId, range);
    const present = attendance.filter((record) => record.status === 'Present').length;
    const absent = attendance.filter((record) => record.status === 'Absent').length;
    const onLeave = attendance.filter((record) => record.status === 'On Leave').length;
    const denominator = present + absent;

    return {
      employee: profile,
      summary: {
        totalDays: attendance.length,
        present,
        absent,
        onLeave,
        attendanceRate: denominator ? round1((present / denominator) * 100) : 0,
      },
      attendance,
    };
  }

}
