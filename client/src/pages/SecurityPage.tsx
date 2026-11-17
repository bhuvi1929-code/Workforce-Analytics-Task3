import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider,
  Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import {
  getSessions, revokeSession, startMfaSetup, verifyMfaSetup,
  type MfaSetupResponse, type SessionInfo,
} from '../services/authClient';

export default function SecurityPage() {
  const { user } = useAuth();
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadSessions = useCallback(async () => {
    try {
      const result = await getSessions();
      setSessions(result.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load sessions.');
    }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function beginSetup() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      setSetup(await startMfaSetup());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start MFA setup.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await verifyMfaSetup(code);
      setMessage('Multi-factor authentication is enabled. Your next login will require an authenticator code.');
      setSetup(null);
      setCode('');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify MFA.');
    } finally {
      setLoading(false);
    }
  }

  async function endSession(sessionId: string) {
    setError('');
    setMessage('');
    try {
      await revokeSession(sessionId);
      setMessage('Selected session has been revoked.');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke session.');
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">Security & Sessions</Typography>
        <Typography color="text.secondary">Manage multi-factor authentication and active sign-in sessions.</Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Multi-factor authentication (MFA)</Typography>
              <Typography color="text.secondary" variant="body2">
                {user?.mfaEnabled ? 'MFA is enabled for your account.' : 'Add an authenticator app as a second sign-in step.'}
              </Typography>
            </Box>
            {user?.mfaEnabled ? (
              <Alert severity="success">Your account is protected by an authenticator code at sign-in.</Alert>
            ) : !setup ? (
              <Box>
                <Button variant="contained" onClick={() => void beginSetup()} disabled={loading}>
                  {loading ? <CircularProgress size={20} /> : 'Set up authenticator'}
                </Button>
              </Box>
            ) : (
              <Stack spacing={2}>
                <Typography variant="body2">Scan this QR code with an authenticator app, then enter the six-digit code shown by the app.</Typography>
                <Box component="img" src={setup.qrCodeDataUrl} alt="Authenticator setup QR code" sx={{ width: 220, maxWidth: '100%', alignSelf: 'flex-start', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }} />
                <Typography variant="body2" fontWeight={600}>Manual setup key</Typography>
                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, overflowWrap: 'anywhere' }}>
                  <Typography component="code">{setup.secret}</Typography>
                </Box>
                <TextField
                  label="Six-digit authenticator code" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' }}
                  fullWidth
                />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" disabled={loading || code.length !== 6} onClick={() => void confirmSetup()}>
                    Verify and enable MFA
                  </Button>
                  <Button color="inherit" disabled={loading} onClick={() => { setSetup(null); setCode(''); }}>Cancel</Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Login sessions</Typography>
              <Typography color="text.secondary" variant="body2">Review sessions associated with your account. You cannot revoke the current session here.</Typography>
            </Box>
            {sessions.length === 0 ? (
              <Typography color="text.secondary">No session records found.</Typography>
            ) : sessions.map((session, index) => (
              <Box key={session.id}>
                {index > 0 && <Divider sx={{ mb: 2 }} />}
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={600}>{session.isCurrent ? 'Current session' : session.revoked_at ? 'Revoked session' : 'Other session'}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">Created: {new Date(session.created_at).toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">Expires: {new Date(session.expires_at).toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">Last used: {session.last_used_at ? new Date(session.last_used_at).toLocaleString() : 'Not recorded'}</Typography>
                  </Box>
                  <Button color="error" variant="outlined" disabled={session.isCurrent || Boolean(session.revoked_at)} onClick={() => void endSession(session.id)}>
                    Revoke
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
