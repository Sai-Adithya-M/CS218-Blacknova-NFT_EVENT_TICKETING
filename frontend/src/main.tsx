import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-right" toastOptions={{ style: { background: '#1A1825', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
  </StrictMode>,
)
