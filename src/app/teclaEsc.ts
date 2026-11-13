import { useEffect, useRef } from 'react'

// Esc fecha a janela/menu/painel que está por cima — só ele. Cada um que está aberto entra numa pilha
// ao abrir e sai ao fechar; a tecla vai sempre pro último (uma confirmação aberta por cima de uma
// janela fecha antes dela). Quem trata o Esc por conta própria (ex.: fechar as sugestões de um campo)
// chama preventDefault e a pilha deixa passar.

const pilha: Array<{ fechar: () => void }> = []
let ouvindo = false

function aoTeclar(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  const topo = pilha[pilha.length - 1]
  if (!topo) return
  e.preventDefault()
  topo.fechar()
}

/** Enquanto `ativo`, o Esc chama `fechar` (se este for o aberto mais recente). */
export function useFecharComEsc(fechar: () => void, ativo = true) {
  const atual = useRef(fechar)
  useEffect(() => {
    atual.current = fechar
  })
  useEffect(() => {
    if (!ativo) return
    const item = { fechar: () => atual.current() }
    pilha.push(item)
    if (!ouvindo) {
      window.addEventListener('keydown', aoTeclar)
      ouvindo = true
    }
    return () => {
      const i = pilha.lastIndexOf(item)
      if (i >= 0) pilha.splice(i, 1)
    }
  }, [ativo])
}
