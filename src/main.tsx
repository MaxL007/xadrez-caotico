import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { iniciarAplicativo } from './aplicativo'
import { iniciarConvites } from './conta/conviteDeAmizade'
import './index.css'

iniciarAplicativo()
iniciarConvites()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
