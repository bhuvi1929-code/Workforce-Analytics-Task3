import { useMemo } from 'react';
import { Box, Card, CardContent, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useAsync } from '../hooks/useAsync';
import { api } from '../services/api';
import { ErrorState } from '../components/common/States';

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function EmployeeDashboardPage() {
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    return { from: dateOnly(from), to: dateOnly(to) };
  }, []);

  const { state, retry } = useAsync(
    (signal) => api.getPersonalDashboard(range.from, range.to, signal),
    [range.from, range.to],
  );



  if (state.status === 'loading') {
    return <Box role="status" aria-busy="true"><Typography color="text.secondary">Loading your personal dashboard…</Typography></Box>;
  }
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={retry} />;

  const { employee, summary, attendance } = state.data;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">My Workforce Dashboard</Typography>
        <Typography color="text.secondary">Your employee profile and attendance summary for the last 30 days.</Typography>
      </Box>

      {employee ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">{employee.name}</Typography>
            <Typography color="text.secondary">{employee.code} · {employee.email}</Typography>
            <Typography color="text.secondary">{employee.department} · {employee.location}</Typography>
            <Box sx={{ mt: 1 }}><Chip size="small" label={employee.status} color="success" /></Box>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined"><CardContent><Typography>Employee profile is not linked to this account.</Typography></CardContent></Card>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        {[
          ['Present', summary.present],
          ['Absent', summary.absent],
          ['On leave', summary.onLeave],
          ['Attendance rate', `${summary.attendanceRate.toFixed(1)}%`],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="outlined"><CardContent>
            <Typography color="text.secondary" variant="body2">{label}</Typography>
            <Typography variant="h4" fontWeight={700}>{value}</Typography>
          </CardContent></Card>
        ))}
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>My attendance history</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Showing {summary.totalDays} attendance records from {range.from} to {range.to}.</Typography>
        <TableContainer component={Paper} sx={{ border: 1, borderColor: 'divider' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Status</TableCell><TableCell>Check-in</TableCell></TableRow></TableHead>
            <TableBody>
              {attendance.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell><Chip size="small" label={record.status} color={record.status === 'Present' ? 'success' : record.status === 'Absent' ? 'error' : 'info'} /></TableCell>
                  <TableCell>{record.checkIn ?? '—'}</TableCell>
                </TableRow>
              ))}
              {attendance.length === 0 && <TableRow><TableCell colSpan={3} align="center">No attendance records in this date range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Stack>
  );
}
