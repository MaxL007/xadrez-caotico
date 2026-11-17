import { useEffect, useRef, useState } from 'react'
import { entrarNaFila, sairDaFila, verFila, type SituacaoNaFila } from '../dados/servidor'
import { RITMOS, RITMO_PADRAO, type Ritmo } from '../jogo/relogio'
import type { Traduzir } from '../textos/idiomas'

/** De quanto em quanto tempo o aparelho pergunta se já achou alguém. */
const PERGUNTA_MS = 2500

/**
 * O adversário automático: uma blitz com alguém que também está procurando agora, no mesmo ritmo. Enquanto procura, o
 * aparelho pergunta ao servidor a cada poucos segundos; ao achar, a partida abre sozinha. Sair do painel tira da fila.
 */
export function AdversarioAutomatico({ t, onAbrirSala }: { t: Traduzir; onAbrirSala: (codigo: string) => void }) {
  const [ritmo, setRitmo] = useState<Ritmo>(RITMO_PADRAO)
  const [procurandoDesde, setProcurandoDesde] = useState<number | null>(null)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState(false)
  const procurando = procurandoDesde !== null
  const abrirRef = useRef(onAbrirSala)
  abrirRef.current = onAbrirSala

  useEffect(() => {
    if (procurandoDesde === null) return
    let ativo = true
    const achou = (situacao: SituacaoNaFila) => {
      if (!ativo || situacao.estado !== 'achou') return false
      ativo = false
      setProcurandoDesde(null)
      abrirRef.current(situacao.codigo)
      return true
    }
    const perguntar = window.setInterval(() => {
      setSegundos(Math.round((Date.now() - procurandoDesde) / 1000))
      verFila()
        .then((situacao) => {
          if (achou(situacao) || !ativo) return
          // a fila esqueceu (ficou muito tempo sem perguntar, outro aparelho saiu): entra de novo
          if (situacao.estado === 'fora') void entrarNaFila(ritmo).then(achou).catch(() => undefined)
        })
        .catch(() => {
          // sem conexão por um instante: pergunta de novo na próxima
        })
    }, PERGUNTA_MS)
    return () => {
      window.clearInterval(perguntar)
      // saiu do painel ou parou de procurar sem achar: sai da fila
      if (ativo) void sairDaFila().catch(() => undefined)
      ativo = false
    }
  }, [procurandoDesde, ritmo])

  async function procurar() {
    setErro(false)
    try {
      const situacao = await entrarNaFila(ritmo)
      if (situacao.estado === 'achou') onAbrirSala(situacao.codigo)
      else {
        setSegundos(0)
        setProcurandoDesde(Date.now())
      }
    } catch {
      setErro(true)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#c9a24a]/40 bg-[#2a1c10]/70 p-3" data-adversario-automatico>
      <p className="text-sm font-semibold">{t('automatico.titulo')}</p>
      <p className="text-xs text-[#c9b48a]">{t('automatico.dica')}</p>
      <div role="radiogroup" aria-label={t('modo.ritmo')} className="grid grid-cols-3 gap-1.5">
        {RITMOS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={ritmo === r}
            disabled={procurando}
            onClick={() => setRitmo(r)}
            className={`rounded-lg border px-1 py-1 font-mono text-xs font-bold transition disabled:opacity-60 ${ritmo === r ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'}`}
            data-ritmo-automatico={r}
          >
            {r}
          </button>
        ))}
      </div>
      {procurando ? (
        <div className="flex items-center justify-between gap-2" role="status" data-procurando>
          <p className="flex items-center gap-2 text-xs">
            <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#e6c675] border-t-transparent" />
            {t('automatico.procurando', { ritmo, segundos })}
          </p>
          <button type="button" onClick={() => setProcurandoDesde(null)} className="shrink-0 rounded-lg border border-[#c9a24a]/50 px-2.5 py-1 text-xs font-semibold hover:bg-[#3a2614]">
            {t('automatico.cancelar')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => void procurar()} className="w-full rounded-lg bg-[#c9a24a] px-3 py-1.5 text-sm font-semibold text-[#1c120a] transition hover:bg-[#e6c675]" data-procurar>
          {t('automatico.procurar')}
        </button>
      )}
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t('automatico.erro')}
        </p>
      )}
    </div>
  )
}
