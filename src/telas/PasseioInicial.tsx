import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ChaveTexto, Traduzir } from '../textos/idiomas'

// O passeio da primeira vez: 6 passos pelo menu, um botão de cada vez em destaque, com Pular sempre à mão. Aparece
// sozinho só para quem nunca jogou; depois, nas Configurações ("Ver o passeio de novo").

const CHAVE_VISTO = 'xadrez:passeioVisto'

/** O botão em destaque em cada passo (`data-passeio` no menu); sem alvo, o cartão fica no meio da tela. */
const PASSOS: { alvo?: string; titulo: ChaveTexto; texto: ChaveTexto }[] = [
  { titulo: 'passeio.boasVindas.titulo', texto: 'passeio.boasVindas.texto' },
  { alvo: 'novoJogo', titulo: 'passeio.novoJogo.titulo', texto: 'passeio.novoJogo.texto' },
  { alvo: 'amigos', titulo: 'passeio.amigos.titulo', texto: 'passeio.amigos.texto' },
  { alvo: 'loja', titulo: 'passeio.loja.titulo', texto: 'passeio.loja.texto' },
  { alvo: 'perfil', titulo: 'passeio.perfil.titulo', texto: 'passeio.perfil.texto' },
  { titulo: 'passeio.partida.titulo', texto: 'passeio.partida.texto' },
]

export function passeioJaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE_VISTO) === '1'
  } catch {
    return true
  }
}

export function marcarPasseioVisto() {
  try {
    localStorage.setItem(CHAVE_VISTO, '1')
  } catch {
    // sem armazenamento: o passeio volta na próxima vez, sem problema
  }
}

/** Os testes automáticos não veem o passeio (o navegador deles avisa que é automático), a não ser que peçam. */
export const passeioNaAutomacao = () => !navigator.webdriver || !!(window as unknown as { __comPasseio?: boolean }).__comPasseio

const MARGEM = 8

export function PasseioInicial({ t, onFim }: { t: Traduzir; onFim: () => void }) {
  const [passo, setPasso] = useState(0)
  const [caixa, setCaixa] = useState<DOMRect | null>(null)
  const atual = PASSOS[passo]
  const ultimo = passo === PASSOS.length - 1

  const medir = useCallback(() => {
    const alvo = atual.alvo ? document.querySelector(`[data-passeio="${atual.alvo}"]`) : null
    setCaixa(alvo ? alvo.getBoundingClientRect() : null)
  }, [atual.alvo])
  useLayoutEffect(medir, [medir])
  useEffect(() => {
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [medir])

  const terminar = useCallback(() => {
    marcarPasseioVisto()
    onFim()
  }, [onFim])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') terminar()
      else if (e.key === 'ArrowRight' && !ultimo) setPasso((p) => p + 1)
      else if (e.key === 'ArrowLeft') setPasso((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [terminar, ultimo])

  // o cartão vai embaixo do botão em destaque, ou em cima se não couber; sem botão, no meio
  const largura = Math.min(320, window.innerWidth - 2 * MARGEM)
  const posicao = caixa
    ? {
        left: Math.min(Math.max(MARGEM, caixa.left + caixa.width / 2 - largura / 2), window.innerWidth - largura - MARGEM),
        ...(caixa.bottom + 190 < window.innerHeight ? { top: caixa.bottom + 12 } : { bottom: window.innerHeight - caixa.top + 12 }),
      }
    : { left: (window.innerWidth - largura) / 2, top: Math.max(MARGEM, window.innerHeight / 2 - 110) }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={t('passeio.rotulo')} data-passeio-passo={passo}>
      {/* o escuro em volta: um buraco no botão em destaque */}
      {caixa ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-[#e6c675] transition-all duration-300"
          style={{
            left: caixa.left - 6,
            top: caixa.top - 6,
            width: caixa.width + 12,
            height: caixa.height + 12,
            boxShadow: '0 0 0 9999px rgba(10,6,3,0.72)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgba(10,6,3,0.72)]" />
      )}
      <div
        className="absolute rounded-2xl border border-[#e6c675] bg-[#1c120a] p-4 text-[#f5e6c8] shadow-2xl"
        style={{ width: largura, ...posicao }}
        aria-live="polite"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#c9b48a]">{t('passeio.passo', { n: passo + 1, total: PASSOS.length })}</p>
        <h3 className="mt-1 font-display text-base font-semibold text-[#e6c675]">{t(atual.titulo)}</h3>
        <p className="mt-1.5 text-sm leading-relaxed">{t(atual.texto)}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={terminar} className="text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline" data-passeio-pular>
            {t('passeio.pular')}
          </button>
          <div className="flex gap-2">
            {passo > 0 && (
              <button type="button" onClick={() => setPasso(passo - 1)} className="rounded-lg border border-[#c9a24a]/50 px-3 py-1 text-xs font-semibold hover:bg-[#3a2614]">
                {t('passeio.voltar')}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => (ultimo ? terminar() : setPasso(passo + 1))}
              className="rounded-lg bg-[#c9a24a] px-3 py-1 text-xs font-semibold text-[#1c120a] hover:bg-[#e6c675]"
              data-passeio-proximo
            >
              {t(ultimo ? 'passeio.comecar' : 'passeio.proximo')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
