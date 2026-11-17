import { useRef, useState, type FormEvent } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container, Paper, Stack,
  TextField, Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

const roles = [
  { name: 'Admin', description: 'System administration', icon: '🛡️' },
  { name: 'HR', description: 'Human resources', icon: '👥' },
  { name: 'Manager', description: 'Department management', icon: '💼' },
  { name: 'Team Lead', description: 'Team management', icon: '👨‍💻' },
  { name: 'Employee', description: 'Personal dashboard', icon: '👤' },
];

export default function LoginPage() {
  const { login, verifyLoginMfa } = useAuth();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [selectedRole, setSelectedRole] = useState('Admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const challenge = await login(email.trim(), password, selectedRole);
      if (challenge) {
        setChallengeId(challenge.challengeId);
      } else {
        window.location.hash = '#/dashboard';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeId) return;
    setError('');
    setLoading(true);
    try {
      await verifyLoginMfa(challengeId, mfaCode);
      window.location.hash = '#/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
        <Paper elevation={4} sx={{ p: { xs: 3, sm: 4 }, width: '100%', borderRadius: 3 }}>
          <Stack spacing={3}>
            <Box textAlign="center">
              <Typography variant="h4" fontWeight={700} color="primary">Workforce Analytics</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {challengeId ? 'Verify your authenticator code' : 'Select your login portal'}
              </Typography>
            </Box>

            {!challengeId && (
              <Box>
                <Typography fontWeight={600} sx={{ mb: 1.5 }}>Choose your role</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                  {roles.map((role) => {
                    const selected = selectedRole === role.name;
                    return (
                      <Button
                        key={role.name}
                        variant={selected ? 'contained' : 'outlined'}
                        color="primary"
                        onClick={() => { setSelectedRole(role.name); setError(''); }}
                        disabled={loading}
                        sx={{
                          gridColumn: role.name === 'Employee' ? '1 / -1' : 'auto',
                          minHeight: 85, textTransform: 'none', borderRadius: 2,
                          display: 'flex', flexDirection: 'column', gap: 0.5,
                        }}
                      >
                        <Typography fontSize={23}>{role.icon}</Typography>
                        <Typography fontWeight={700}>{role.name} Login</Typography>
                        <Typography variant="caption">{role.description}</Typography>
                      </Button>
                    );
                  })}
                </Box>
              </Box>
            )}

            {error && <Alert severity="error">{error}</Alert>}

            {!challengeId ? (
              <>
                <Typography variant="h6" fontWeight={600}>{selectedRole} Sign In</Typography>
                <Box component="form" onSubmit={handleSubmit}>
                  <Stack spacing={2}>
                    <TextField
                      label="Email address" type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          passwordRef.current?.focus();
                        }
                      }}
                      autoComplete="username" required fullWidth autoFocus
                    />
                    <TextField
                      inputRef={passwordRef} label="Password" type="password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password" required fullWidth
                    />
                    <Button type="submit" variant="contained" size="large" disabled={loading || !email.trim() || !password} fullWidth>
                      {loading ? <CircularProgress size={24} color="inherit" /> : `Sign In as ${selectedRole}`}
                    </Button>
                  </Stack>
                </Box>
              </>
            ) : (
              <Box component="form" onSubmit={handleMfaSubmit}>
                <Stack spacing={2}>
                  <Typography color="text.secondary" variant="body2">
                    Enter the six-digit code from your authenticator app. This code expires with the sign-in challenge.
                  </Typography>
                  <TextField
                    label="Authenticator code" value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' }}
                    required fullWidth autoFocus
                  />
                  <Button type="submit" variant="contained" size="large" disabled={loading || mfaCode.length !== 6}>
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify and Sign In'}
                  </Button>
                  <Button color="inherit" disabled={loading} onClick={() => { setChallengeId(null); setMfaCode(''); setPassword(''); setError(''); }}>
                    Back to login
                  </Button>
                </Stack>
              </Box>
            )}

            <Typography variant="caption" color="text.secondary" textAlign="center">
              Secure Workforce Analytics Platform
            </Typography>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
