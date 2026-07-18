import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const originalWarn = console.warn
const originalError = console.error

function shouldIgnoreThreeClockMessage(args) {
  const first = String(args?.[0] ?? '')
  return first.includes('THREE.Clock:')
}

console.warn = (...args) => {
  if (shouldIgnoreThreeClockMessage(args)) return
  originalWarn(...args)
}

console.error = (...args) => {
  if (shouldIgnoreThreeClockMessage(args)) return
  originalError(...args)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
