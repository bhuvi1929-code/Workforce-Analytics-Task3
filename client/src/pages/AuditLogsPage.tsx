import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { ErrorState } from '../components/common/States';
import { useAsync } from '../hooks/useAsync';
import { api } from '../services/api';

export default function AuditLogsPage() {
  const { state, retry } = useAsync((signal) => api.getAuditLogs(signal), []);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" component="h1">Audit Logs</Typography>
        <Typography color="text.secondary">Recent authentication and security events recorded by the backend.</Typography>
      </Box>
      {state.status === 'loading' && <Typography color="text.secondary">Loading audit events…</Typography>}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && (
        <TableContainer component={Paper} sx={{ border: 1, borderColor: 'divider' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Time</TableCell><TableCell>Event</TableCell><TableCell>User ID</TableCell><TableCell>IP address</TableCell><TableCell>Details</TableCell></TableRow></TableHead>
            <TableBody>
              {state.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(item.created_at).toLocaleString()}</TableCell>
                  <TableCell><Chip size="small" label={item.event_type} color={item.event_type.includes('FAILED') || item.event_type.includes('BLOCKED') ? 'warning' : 'default'} /></TableCell>
                  <TableCell>{item.user_id ?? '—'}</TableCell>
                  <TableCell>{item.ip_address ?? '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 280, overflowWrap: 'anywhere' }}>{item.details ?? '—'}</TableCell>
                </TableRow>
              ))}
              {state.data.items.length === 0 && <TableRow><TableCell colSpan={5} align="center">No audit events recorded yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
