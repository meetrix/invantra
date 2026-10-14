import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled rather than loaded from a CDN, so printed documents use the same typeface on any machine,
// offline included — fallback fonts differ in width enough to move line and page breaks.
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
