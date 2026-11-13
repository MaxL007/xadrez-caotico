import type { ChaveTexto, Traduzir } from '../textos/idiomas'
import { CONQUISTAS, NIVEIS, type Conquista, type SituacaoDasConquistas } from '../conta/conquistas'
import { Oticoin } from './ElementosDoJogador'

// As conquistas, nos três níveis do desenho: básicas, intermediárias e avançadas, cada uma com a barra de quanto falta.

export function nomeDaConquista(t: Traduzir, conquista: Conquista): string {
  const chave = conquista.meta === 1 ? `conquistas.medida.${conquista.medida}Um` : `conquistas.medida.${conquista.medida}`
  return t(chave as ChaveTexto, { n: conquista.meta })
}

/** O que o painel mostra: as conquistas de quem joga ou, no perfil de um amigo, as dele. */
type Situacao = Pick<SituacaoDasConquistas, 'contagem' | 'oticoins' | 'recebidas'>

export function PainelConquistas({ t, situacao, doAmigo = false }: { t: Traduzir; situacao: Situacao | null; doAmigo?: boolean }) {
  const recebida = (c: Conquista) => situacao?.recebidas.includes(c.id) ?? false
  const feitas = CONQUISTAS.filter((c) => situacao && (recebida(c) || situacao.contagem[c.medida] >= c.meta)).length
  return (
    <div className="space-y-4" data-conquistas={doAmigo ? 'amigo' : ''}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{t('conquistas.resumo', { feitas, total: CONQUISTAS.length })}</p>
        {!doAmigo && situacao?.oticoins != null && (
          <p className="flex items-center gap-1.5 text-sm font-semibold" data-saldo>
            <Oticoin tamanho={28} girando />
            {t('perfil.oticoins', { n: situacao.oticoins })}
          </p>
        )}
      </div>
      {!doAmigo && <p className="text-xs text-[#c9b48a]">{t('conquistas.regra')}</p>}
      {!doAmigo && situacao?.oticoins == null && <p className="text-xs text-[#c9b48a]">{t('conquistas.entrar')}</p>}

      {NIVEIS.map((nivel) => (
        <div key={nivel} className="space-y-2 border-t border-[#c9a24a]/20 pt-3" data-nivel={nivel}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Oticoin tamanho={18} figura={nivel === 'basicas' ? 'peao' : 'rei'} />
            {t(`conquistas.nivel.${nivel}` as ChaveTexto)}
          </p>
          {CONQUISTAS.filter((c) => c.nivel === nivel).map((conquista) => {
            const jaRecebida = recebida(conquista)
            // recebida é alcançada, mesmo que o aparelho que contou ainda não tenha mandado o progresso
            const atual = jaRecebida ? conquista.meta : Math.min(situacao?.contagem[conquista.medida] ?? 0, conquista.meta)
            return (
              <div key={conquista.id} className="rounded-lg bg-[#2a1c10] px-3 py-2" data-conquista={conquista.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`min-w-0 truncate text-xs font-medium ${jaRecebida ? 'text-[#9fe0a8]' : ''}`}>
                    {jaRecebida ? '✓ ' : ''}
                    {nomeDaConquista(t, conquista)}
                  </p>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#e6c675]">
                    <Oticoin tamanho={14} figura={conquista.nivel === 'basicas' ? 'peao' : 'rei'} />
                    {conquista.oticoins}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1c120a]">
                    <div className={`h-full rounded-full ${jaRecebida ? 'bg-[#9fe0a8]' : 'bg-[#c9a24a]'}`} style={{ width: `${(atual / conquista.meta) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[0.65rem] text-[#c9b48a]">
                    {atual}/{conquista.meta}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
