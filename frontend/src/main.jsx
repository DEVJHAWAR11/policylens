import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode removed — it double-invokes useEffect in dev which was causing
// processFile to fire twice on mount, creating 2 uploads per file.
createRoot(document.getElementById('root')).render(
  <App />
)
