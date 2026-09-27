import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ColorSchemeProvider } from './context/ColorSchemeProvider'
import { ToastProvider } from './context/ToastProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorSchemeProvider>
  </StrictMode>,
)
