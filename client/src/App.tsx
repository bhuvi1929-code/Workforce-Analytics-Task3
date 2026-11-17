
import { useMemo, useState } from 'react';
import {
  CssBaseline,
  ThemeProvider,
  useMediaQuery,
  Box,
  CircularProgress,
  Typography,
  Button,
} from '@mui/material';

import AppShell from './components/layout/AppShell';
import { FiltersProvider } from './context/FiltersContext';
import { useAuth } from './context/AuthContext';
import { useHashRoute } from './hooks/useHashRoute';

import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeDashboardPage from './pages/EmployeeDashboardPage';
import SecurityPage from './pages/SecurityPage';
import AuditLogsPage from './pages/AuditLogsPage';
import LoginPage from './pages/LoginPage';

import { buildTheme } from './theme';

type Mode = 'light' | 'dark';

const TITLES = {
  dashboard: 'Dashboard',
  employees: 'Employees',
  security: 'Security & Sessions',
  audit: 'Audit Logs',
} as const;

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h4" gutterBottom>
        Access Denied
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        You do not have permission to access this page.
      </Typography>
      <Button variant="contained" onClick={onBack}>
        Go to Dashboard
      </Button>
    </Box>
  );
}

function AuthenticatedApp() {
  const { user, loading, logout } = useAuth();
  const route = useHashRoute();

  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  const [mode, setMode] = useState<Mode | null>(() => {
    try {
      return (localStorage.getItem('wa-mode') as Mode | null) ?? null;
    } catch {
      return null;
    }
  });

  const effective: Mode = mode ?? (prefersDark ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(effective), [effective]);

  const toggle = () => {
    const next: Mode = effective === 'dark' ? 'light' : 'dark';
    setMode(next);

    try {
      localStorage.setItem('wa-mode', next);
    } catch {
      // Storage unavailable.
    }
  };

  const hasDashboard = user
    ? user.permissions.includes('dashboard:read') || user.permissions.includes('dashboard:read_self')
    : false;

  const hasEmployees = user
    ? [
        'employees:read_all',
        'employees:read_department',
        'employees:read_self',
      ].some((permission) => user.permissions.includes(permission))
    : false;

  const allowed = route === 'dashboard' ? hasDashboard : route === 'employees' ? hasEmployees : route === 'audit' ? Boolean(user?.permissions.includes('audit:read')) : true;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {loading ? (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CircularProgress />
        </Box>
      ) : !user ? (
        <LoginPage />
      ) : (
        <FiltersProvider>
          <AppShell
            route={route}
            title={TITLES[route]}
            onToggleMode={toggle}
            user={user}
            onLogout={() => void logout()}
          >
            {!allowed ? (
              <AccessDenied
                onBack={() => {
                  window.location.hash = hasDashboard
                    ? '#/dashboard'
                    : hasEmployees ? '#/employees' : '#/security';
                }}
              />
            ) : route === 'dashboard' ? (
              user?.permissions.includes('dashboard:read_self') && !user.permissions.includes('dashboard:read')
                ? <EmployeeDashboardPage />
                : <DashboardPage />
            ) : route === 'employees' ? (
              <EmployeesPage />
            ) : route === 'security' ? (
              <SecurityPage />
            ) : (
              <AuditLogsPage />
            )}
          </AppShell>
        </FiltersProvider>
      )}
    </ThemeProvider>
  );
}

export default function App() {
  return <AuthenticatedApp />;
}
