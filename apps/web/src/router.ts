import { useEffect, useState } from 'react';

export type Route = { name: 'dashboard' } | { name: 'course'; id: string };

export function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  const match = hash.match(/^\/course\/([\w-]+)/);
  const id = match?.[1];
  if (id) return { name: 'course', id };
  return { name: 'dashboard' };
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
