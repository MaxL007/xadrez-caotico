import { useEffect, useState } from 'react'
import { formatarTempo, type Ritmo } from '../jogo/relogio'
import type { Traduzir } from '../textos/idiomas'

/** O que o relógio mostra: quanto resta a cada lado, de quem é a vez e se o tempo está correndo agora. */
export interface MostradorDoRelogio {
  w: number
  b: number
  vez: 'w' | 'b'
  correndo: boolean
}

/** Abaixo disso o tempo de quem tem a vez fica vermelho. */
const POUCO_TEMPO_MS = 20_000

/**
 * O relógio da blitz, no canto de cima: em cima o da máquina, embaixo o seu, como num relógio de verdade ao lado do
 * tabuleiro. `andar` desconta o tempo (é o tabuleiro que sabe se o relógio corre) e devolve o que mostrar; o relógio
 * chama a cada décimo de segundo, e só desenha de novo quando o que aparece muda.
 */
export function RelogioDaPartida({
  t,
  ritmo,
  corDoJogador,
  andar,
  adversario,
}: {
  t: Traduzir
  ritmo: Ritmo
  corDoJogador: 'w' | 'b'
  andar: () => MostradorDoRelogio | null
  /** O nome de quem joga do outro lado; sem nome, é a máquina. */
  adversario?: string | null
}) {
  const [mostrador, setMostrador] = useState<MostradorDoRelogio | null>(null)
  useEffect(() => {
    const tique = () => {
      const novo = andar()
      setMostrador((velho) =>
        velho && novo && velho.vez === novo.vez && velho.correndo === novo.correndo && formatarTempo(velho.w) === formatarTempo(novo.w) && formatarTempo(velho.b) === formatarTempo(novo.b)
          ? velho
          : novo,
      )
    }
    tique()
    const id = window.setInterval(tique, 100)
    return () => window.clearInterval(id)
  }, [andar])
  if (!mostrador) return null
  const maquina = corDoJogador === 'w' ? 'b' : 'w'
  const linha = (cor: 'w' | 'b', nome: string) => {
    const ativo = mostrador.vez === cor
    const pouco = ativo && mostrador[cor] < POUCO_TEMPO_MS
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-1 transition-colors ${
          pouco ? 'bg-rose-700 text-white' : ativo ? 'bg-[#f5e6c8] text-[#1c120a]' : 'bg-[#1c120a]/70 text-[#c9b48a]'
        }`}
        data-relogio-lado={cor}
        data-ativo={ativo ? (mostrador.correndo ? 'correndo' : 'parado') : undefined}
      >
        <span className="text-xs font-semibold">{nome}</span>
        <span className="font-mono text-base font-bold tabular-nums" data-tempo>
          {formatarTempo(mostrador[cor])}
        </span>
      </div>
    )
  }
  return (
    <div className="flex min-w-[8.5rem] flex-col gap-1 rounded-lg bg-[#1c120a]/55 p-1 shadow backdrop-blur" role="timer" aria-label={t('blitz.relogio', { ritmo })} data-relogio={ritmo}>
      <p className="px-1 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-[#e6c675]">{t('blitz.titulo', { ritmo })}</p>
      {linha(maquina, adversario || t('lances.maquina'))}
      {linha(corDoJogador, t('lances.voce'))}
    </div>
  )
}
