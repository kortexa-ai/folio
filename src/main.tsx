import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './polish.css';
import { logEvent } from './journal';

logEvent(`boot · build ${__BUILD_STAMP__} · ${screen.width}x${screen.height}${(navigator as { standalone?: boolean }).standalone ? ' · installed PWA' : ''}`);
addEventListener('error', event => logEvent(`error: ${event.message} @ ${event.filename?.split('/').pop()}:${event.lineno}`));
addEventListener('unhandledrejection', event => logEvent(`unhandled rejection: ${String(event.reason).slice(0, 150)}`));
addEventListener('pagehide', () => logEvent('pagehide (clean exit)'));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
