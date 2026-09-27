import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { auth } from './lib/auth.js'
import { startRemoteDb } from './lib/remoteDb.js'

async function boot() {
  const session = await auth.bootstrap()
  if (session?.role === 'admin') await startRemoteDb({ session })
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
