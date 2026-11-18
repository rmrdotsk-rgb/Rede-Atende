import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ApiBoundary } from './components/common/ApiBoundary';
import './index.css';
import { AppBoundary } from './components/common/AppBoundary';
import { initializeAppearance } from './utils/appearance';

initializeAppearance();

createRoot(document.getElementById('root')!).render(
  <AppBoundary>
    <ApiBoundary>
      <App />
    </ApiBoundary>
  </AppBoundary>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
