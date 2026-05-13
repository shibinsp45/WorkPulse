import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => (window.caches ? caches.keys() : []))
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('workpulse-')).map((key) => caches.delete(key))))
      .catch(() => {
        // Dev mode should keep serving fresh Vite files even if cache cleanup is blocked.
      });
  });
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    navigator.serviceWorker.register(swUrl).catch(() => {
      // The app still works if service worker registration is blocked.
    });
  });
}
