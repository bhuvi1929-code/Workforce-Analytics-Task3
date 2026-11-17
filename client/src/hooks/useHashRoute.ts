import { useEffect, useState } from 'react';

export type Route = 'dashboard' | 'employees' | 'security' | 'audit';

const parse = (): Route | null => {
  const hash = window.location.hash;
  if (hash === '#/employees') return 'employees';
  if (hash === '#/security') return 'security';
  if (hash === '#/audit') return 'audit';
  if (hash === '#/dashboard') return 'dashboard';
  return null;
};

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse() ?? 'dashboard');
  useEffect(() => {
    const onChange = () => {
      const next = parse();
      if (next) setRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
