import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { iniciarAplicativo } from './app/aplicativo'
import { iniciarConvites } from './conta/conviteDeAmizade'
import { iniciarPresenca } from './conta/presenca'
import './index.css'

iniciarAplicativo()
iniciarConvites()
iniciarPresenca()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
