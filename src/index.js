// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppWrapper from './App';
import reportWebVitals from './reportWebVitals';

// CRA trae un registrador de SW; lo mantenemos desactivado para evitar servir builds antiguas
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

// 👇 Nuevo: watcher de versión para forzar recarga cuando hay deploy
// Asegúrate de que en src/checkVersion.js exportas startVersionWatcher
import { startVersionWatcher } from './checkVersion.js';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);

// Métricas opcionales
reportWebVitals();

// 🔧 Desactiva el Service Worker de CRA (evita caches viejas del build)
serviceWorkerRegistration.unregister();

// 🔁 Activa el verificador de versión.
// Revisa /version.json cada 60s (ajústalo si quieres).
startVersionWatcher({
  url: '/version.json',
  interval: 60_000,
});
