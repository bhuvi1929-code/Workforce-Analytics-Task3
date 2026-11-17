import type { Db } from '../db/connection';
import type {
  ActivityRecord, AttendanceCounts, DateRange, EmployeeFilter, PersonalAttendanceRecord, TrendPoint,
} from '../domain/types';
import type { AttendanceRepository } from './interfaces';
import { employeeWhere } from './sql';

const FROM = 'FROM attendance a JOIN employees e ON e.id = a.employee_id JOIN departments d ON d.id = e.department_id';

export class SqliteAttendanceRepository implements AttendanceRepository {
  constructor(private readonly db: Db) {}

  latestDate(range: DateRange, f: EmployeeFilter): string | null {
    const w = employeeWhere(f);
    const row = this.db.prepare(`SELECT MAX(a.date) AS d ${FROM} WHERE a.date BETWEEN ? AND ? AND ${w.clause}`).get(range.from, range.to, ...w.params) as { d: string | null };
    return row.d;
  }

  
  counts(date: string, f: EmployeeFilter): AttendanceCounts {
    const w = employeeWhere(f);

    const row = this.db.prepare(`
      SELECT
        COUNT(DISTINCT CASE
          WHEN a.status = 'Present' THEN e.id
        END) AS present,

        COUNT(DISTINCT CASE
          WHEN a.status = 'Absent' OR a.id IS NULL THEN e.id
        END) AS absent,

        COUNT(DISTINCT CASE
          WHEN a.status = 'On Leave' THEN e.id
        END) AS onLeave

      FROM employees e
      JOIN departments d ON d.id = e.department_id
      LEFT JOIN attendance a
        ON a.employee_id = e.id AND a.date = ?

      WHERE ${w.clause}
    `).get(date, ...w.params) as unknown as AttendanceCounts;

    return {
      present: row.present,
      absent: row.absent,
      onLeave: row.onLeave,
    };
  }


  trend(range: DateRange, f: EmployeeFilter): TrendPoint[] {
    const w = employeeWhere(f);
    const rows = this.db
      .prepare(
        `SELECT a.date AS date,
                SUM(a.status = 'Present') AS present, SUM(a.status = 'Absent') AS absent, SUM(a.status = 'On Leave') AS onLeave
         ${FROM} WHERE a.date BETWEEN ? AND ? AND ${w.clause} GROUP BY a.date ORDER BY a.date`,
      )
      .all(range.from, range.to, ...w.params) as unknown as TrendPoint[];
    return rows.map((r) => ({ date: r.date, present: r.present, absent: r.absent, onLeave: r.onLeave }));
  }

  rangeTotals(range: DateRange, f: EmployeeFilter): { present: number; absent: number } {
    const w = employeeWhere(f);
    const r = this.db
      .prepare(`SELECT COALESCE(SUM(a.status = 'Present'), 0) AS present, COALESCE(SUM(a.status = 'Absent'), 0) AS absent ${FROM} WHERE a.date BETWEEN ? AND ? AND ${w.clause}`)
      .get(range.from, range.to, ...w.params) as { present: number; absent: number };
    return { present: r.present, absent: r.absent };
  }

  personalRecords(employeeId: number, range: DateRange): PersonalAttendanceRecord[] {
    const rows = this.db.prepare(`
      SELECT id, date, status, check_in AS checkIn
      FROM attendance
      WHERE employee_id = ? AND date BETWEEN ? AND ?
      ORDER BY date DESC LIMIT 90
    `).all(employeeId, range.from, range.to) as unknown as PersonalAttendanceRecord[];
    return rows.map((row) => ({ ...row }));
  }

  recent(range: DateRange, f: EmployeeFilter, limit: number): ActivityRecord[] {
    const w = employeeWhere(f);
    const rows = this.db
      .prepare(
        `SELECT a.id, e.name AS employeeName, d.name AS department, a.status, a.date, a.check_in AS checkIn
         ${FROM} WHERE a.date BETWEEN ? AND ? AND ${w.clause}
         ORDER BY a.date DESC, a.check_in DESC, a.id DESC LIMIT ?`,
      )
      .all(range.from, range.to, ...w.params, limit) as unknown as ActivityRecord[];
    return rows.map((r) => ({ ...r }));
  }
}
