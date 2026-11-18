import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  // Debug handle for inspecting state from devtools during development.
  void import('./state/store').then(({ appStore }) => Object.assign(window, { __branchpoint: appStore }))
}
