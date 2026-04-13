import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId="YOUR_CLIENT_ID_HERE">
      <App />
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1A1825', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
    </GoogleOAuthProvider>
  </StrictMode>,
)
