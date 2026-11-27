import type { ChaveTexto, Traduzir } from '../textos/idiomas'
import { CONQUISTAS, NIVEIS, type Conquista, type SituacaoDasConquistas } from '../conta/conquistas'
import { Oticoin } from './ElementosDoJogador'
import { TITULOS, type Titulo } from '../conta/titulos'

// As conquistas, nos três níveis do desenho: básicas, intermediárias e avançadas, cada uma com a barra de quanto falta.
// As conquistas com patamares (pedido do usuário, 27/11, o modelo do Mobile Legends) vêm antes, num cartão só cada: a
// conquista sobe de patamar (cada patamar é uma conquista do catálogo, que paga como sempre) e o último dá o título.

/** As conquistas que viram patamar de alguma série: saem da lista dos níveis. */
const EM_PATAMARES = new Set(TITULOS.flatMap((titulo) => titulo.conquistas))

const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
export const romano = (n: number) => ROMANOS[n - 1] ?? String(n)

export function nomeDaConquista(t: Traduzir, conquista: Conquista): string {
  const chave = conquista.meta === 1 ? `conquistas.medida.${conquista.medida}Um` : `conquistas.medida.${conquista.medida}`
  return t(chave as ChaveTexto, { n: conquista.meta })
}

/** O que o painel mostra: as conquistas de quem joga ou, no perfil de um amigo, as dele. */
type Situacao = Pick<SituacaoDasConquistas, 'contagem' | 'oticoins' | 'recebidas'>

/** Uma conquista com patamares: a medalha, o patamar de agora, a barra até o próximo e o título no fim. */
function ConquistaComPatamares({ t, titulo, situacao, recebida }: { t: Traduzir; titulo: Titulo; situacao: Situacao | null; recebida: (c: Conquista) => boolean }) {
  const patamares = titulo.conquistas.map((id) => CONQUISTAS.find((c) => c.id === id)).filter((c): c is Conquista => !!c)
  const alcancou = (c: Conquista) => recebida(c) || (situacao?.contagem[c.medida] ?? 0) >= c.meta
  const feitos = patamares.filter(alcancou).length
  const completa = feitos === patamares.length
  // o patamar em andamento: o primeiro que falta (completa, fica no último)
  const atual = patamares[Math.min(feitos, patamares.length - 1)]
  const contagem = Math.min(situacao?.contagem[atual.medida] ?? 0, atual.meta)
  const progresso = completa ? atual.meta : contagem
  const nomeDoTitulo = t(`titulo.${titulo.id}` as ChaveTexto)
  return (
    <div className="rounded-xl border border-[#c9a24a]/35 bg-[#2a1c10] p-3" data-serie={titulo.serie} data-patamares-feitos={feitos}>
      <div className="flex items-center gap-3">
        {/* o lugar da medalha: o desenho ainda vai ser escolhido pelo usuário, então fica vazio */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#c9a24a]/50 bg-[#1c120a]"
          aria-label={t('conquistas.medalha')}
          title={t('conquistas.medalha')}
          data-medalha={titulo.serie}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm font-semibold ${completa ? 'text-[#9fe0a8]' : ''}`}>
              {completa ? '✓ ' : ''}
              {t(`conquistas.serie.${titulo.serie}` as ChaveTexto)} {romano(Math.min(feitos + 1, patamares.length))}
            </span>
            <span className="shrink-0 text-[0.65rem] text-[#c9b48a]">
              {completa ? t('conquistas.patamarMaximo') : t('conquistas.patamar', { n: feitos + 1, total: patamares.length })}
            </span>
          </p>
          {/* os patamares, um tracinho cada: cheio quando alcançado */}
          <div className="mt-1.5 flex gap-1">
            {patamares.map((c, i) => (
              <span
                key={c.id}
                title={`${romano(i + 1)} · ${nomeDaConquista(t, c)} · ${c.oticoins}`}
                className={`h-1.5 flex-1 rounded-full ${alcancou(c) ? 'bg-[#9fe0a8]' : i === feitos ? 'bg-[#c9a24a]/60' : 'bg-[#1c120a]'}`}
                data-conquista={c.id}
                data-alcancado={alcancou(c) || undefined}
              />
            ))}
          </div>
        </div>
      </div>
      {!completa && (
        <>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs">{nomeDaConquista(t, atual)}</p>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#e6c675]">
              <Oticoin tamanho={14} figura={atual.nivel === 'basicas' ? 'peao' : 'rei'} />
              {atual.oticoins}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1c120a]">
              <div className="h-full rounded-full bg-[#c9a24a]" style={{ width: `${(progresso / atual.meta) * 100}%` }} />
            </div>
            <span className="shrink-0 text-[0.65rem] text-[#c9b48a]">
              {progresso}/{atual.meta}
            </span>
          </div>
        </>
      )}
      <p className={`mt-2 text-[0.7rem] font-semibold tracking-wide ${completa ? 'text-[#e6c675]' : 'text-[#c9b48a]'}`} data-recompensa-final>
        {completa ? '✓ ' : '🔒 '}
        {t('conquistas.recompensaFinal', { titulo: nomeDoTitulo })}
      </p>
    </div>
  )
}

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

      {TITULOS.length > 0 && (
        <div className="space-y-2 border-t border-[#c9a24a]/20 pt-3" data-patamares>
          <p className="text-sm font-medium">{t('conquistas.patamares')}</p>
          {TITULOS.map((titulo) => (
            <ConquistaComPatamares key={titulo.id} t={t} titulo={titulo} situacao={situacao} recebida={recebida} />
          ))}
        </div>
      )}

      {/* o nível que ficou sem conquistas soltas (todas viraram patamares) não aparece */}
      {NIVEIS.filter((nivel) => CONQUISTAS.some((c) => c.nivel === nivel && !EM_PATAMARES.has(c.id))).map((nivel) => (
        <div key={nivel} className="space-y-2 border-t border-[#c9a24a]/20 pt-3" data-nivel={nivel}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Oticoin tamanho={18} figura={nivel === 'basicas' ? 'peao' : 'rei'} />
            {t(`conquistas.nivel.${nivel}` as ChaveTexto)}
          </p>
          {CONQUISTAS.filter((c) => c.nivel === nivel && !EM_PATAMARES.has(c.id)).map((conquista) => {
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
