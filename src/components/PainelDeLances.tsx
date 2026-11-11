import { useEffect, useRef, useState } from 'react'
import type { Traduzir } from '../chess/idiomas'

// A aba flutuante dos lances: uma lingueta na borda direita do tabuleiro que abre, por cima dele, os lances da partida
// numa coluna pra cada lado (quem joga, a máquina ou o amigo). Serve na tela normal e na tela cheia do celular.

const FIGURAS: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

/** O lance com a figura da peça no lugar da letra, que não depende do idioma: Nf3 vira ♘f3, e8=Q vira e8=♕. */
const comFigura = (san: string) => san.replace(/^[KQRBN]/, (letra) => FIGURAS[letra]).replace(/=([QRBN])/, (_, letra: string) => `=${FIGURAS[letra]}`)

export function PainelDeLances({ t, lances, brancas, pretas }: { t: Traduzir; lances: string[]; brancas: string; pretas: string }) {
  const [aberto, setAberto] = useState(false)
  const listaRef = useRef<HTMLDivElement>(null)

  // o lance mais novo sempre à vista
  useEffect(() => {
    const lista = listaRef.current
    if (aberto && lista) lista.scrollTop = lista.scrollHeight
  }, [aberto, lances.length])

  const pares: { numero: number; branco: string; preto?: string }[] = []
  for (let i = 0; i < lances.length; i += 2) pares.push({ numero: i / 2 + 1, branco: lances[i], preto: lances[i + 1] })
  const ultimo = lances.length - 1

  return (
    <div className="pointer-events-none absolute right-0 top-1/2 z-[15] flex -translate-y-1/2 items-center" data-lances>
      {aberto && (
        <div
          role="region"
          aria-label={t('lances.titulo')}
          className="pointer-events-auto mr-1 flex max-h-[min(55vh,24rem)] w-[min(15rem,62vw)] flex-col overflow-hidden rounded-xl border border-[#c9a24a]/60 bg-[#1c120a]/90 text-[#f5e6c8] shadow-2xl backdrop-blur"
          data-lista-lances
        >
          <div className="grid grid-cols-[1.75rem_1fr_1fr] gap-1 border-b border-[#c9a24a]/30 px-3 py-2 text-[0.7rem] font-semibold">
            <span className="text-[#c9b48a]">#</span>
            <span className="flex min-w-0 items-center gap-1">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-[#b9b2a6] bg-[#f7f4ee]" />
              <span className="truncate">{brancas}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-[#8f7a58] bg-[#14110e]" />
              <span className="truncate">{pretas}</span>
            </span>
          </div>
          <div ref={listaRef} className="overflow-y-auto px-3 py-1.5 text-sm">
            {pares.length === 0 ? (
              <p className="py-2 text-xs text-[#c9b48a]">{t('registro.semLances')}</p>
            ) : (
              pares.map(({ numero, branco, preto }) => (
                <div key={numero} className="grid grid-cols-[1.75rem_1fr_1fr] gap-1 py-0.5 tabular-nums">
                  <span className="text-xs leading-5 text-[#c9b48a]">{numero}.</span>
                  <span className={`rounded px-1 ${(numero - 1) * 2 === ultimo ? 'bg-[#c9a24a] font-semibold text-[#1c120a]' : ''}`}>{comFigura(branco)}</span>
                  <span className={`rounded px-1 ${(numero - 1) * 2 + 1 === ultimo ? 'bg-[#c9a24a] font-semibold text-[#1c120a]' : ''}`}>{preto ? comFigura(preto) : ''}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((agora) => !agora)}
        aria-expanded={aberto}
        aria-label={t('lances.titulo')}
        className="pointer-events-auto rounded-l-lg border border-r-0 border-[#c9a24a]/60 bg-[#1c120a]/85 px-1.5 py-3 text-xs font-semibold text-[#f5e6c8] shadow-lg backdrop-blur [writing-mode:vertical-rl]"
        data-aba-lances
      >
        {t('lances.aba')} · {lances.length}
      </button>
    </div>
  )
}
