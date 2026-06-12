import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startRemoteDb } from './lib/remoteDb.js'

// Durable persistence: hydrate from + mirror to Postgres when the
// backend is configured (DATABASE_URL + DB_SYNC_TOKEN). No-op locally.
startRemoteDb()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
