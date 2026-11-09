import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
const positions = new Map<string, number>();
export function RouteScroll() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const initial = useRef(true);
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    const pathChanged = previousPath.current !== location.pathname;
    const shouldFocus = pathChanged && navigationType !== 'POP';
    const shouldScroll = initial.current || pathChanged || navigationType === 'POP';
    initial.current = false;
    previousPath.current = location.pathname;
    const frame = requestAnimationFrame(() => {
      if (shouldScroll)
        window.scrollTo({
          top: navigationType === 'POP' ? (positions.get(location.key) ?? 0) : 0,
          behavior: 'instant',
        });
      if (shouldFocus) {
        const main = document.getElementById('main-content');
        main?.focus({ preventScroll: true });
      }
    });
    const save = () => positions.set(location.key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', save);
    };
  }, [location.key, location.pathname, navigationType]);
  return null;
}
