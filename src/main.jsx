import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { auth } from './lib/auth.js'
import { finishStartup } from './lib/startup.js'

// Public content renders immediately. Protected workspaces wait for verified
// authentication and their database snapshot through the route guards.
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
function cachedRole() {
  try { return JSON.parse(localStorage.getItem('um.session.v1') || 'null')?.role || null } catch { return null }
}
async function boot() {
  try {
    if (cachedRole() === 'admin') import('./lib/remoteDb.js').then(m => m.warmRemoteDb()).catch(() => {})
    const session = await auth.bootstrap()
    if (session?.role === 'admin') {
      const { startRemoteDb } = await import('./lib/remoteDb.js')
      await startRemoteDb({ session })
    }
  } finally {
    finishStartup()
  }
}
boot().catch(error => console.warn('Account startup did not complete:', error.message))
