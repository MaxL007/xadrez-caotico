import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { iniciarAplicativo } from './app/aplicativo'
import { iniciarConvites } from './conta/conviteDeAmizade'
import { iniciarPresenca } from './conta/presenca'
import { iniciarRegistroDeErros } from './app/registroDeErros'
import './index.css'

iniciarRegistroDeErros()
iniciarAplicativo()
iniciarConvites()
iniciarPresenca()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
