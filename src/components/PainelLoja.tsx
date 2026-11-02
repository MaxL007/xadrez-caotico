import { useState } from 'react'
import type { ChaveTexto, Traduzir } from '../chess/idiomas'
import { CONQUISTAS } from '../chess/conquistas'
import { comprarItem, ITENS, opcaoLiberada, usePersonalizacao, type Peca } from '../conta/personalizacao'
import { ErroDoServidor } from '../db/servidor'
import { Oticoin } from './ElementosDoJogador'
import { nomeDaConquista } from './PainelConquistas'

// A Loja: os equipamentos da Personalização que não são do básico. Cada um também libera com uma conquista.

/** As peças que usam o item: as partes do corpo servem pra todas. */
function pecasDoItem(parte: string, opcao: string): Peca[] | null {
  if (parte === 'arma') return opcao === 'espada' ? ['p'] : opcao === 'machado' || opcao === 'maca' ? ['r'] : ['b', 'q', 'k']
  if (parte === 'cavalo' || parte === 'sela' || parte === 'cabresto') return ['n']
  return null
}

export function PainelLoja({ t, saldo, onSaldo }: { t: Traduzir; saldo: number | null; onSaldo: (saldo: number) => void }) {
  const personalizacao = usePersonalizacao()
  const [comprando, setComprando] = useState<string | null>(null)
  const [erro, setErro] = useState<ChaveTexto | null>(null)

  async function comprar(item: string) {
    setComprando(item)
    setErro(null)
    try {
      onSaldo(await comprarItem(item))
    } catch (falha) {
      setErro(falha instanceof ErroDoServidor && falha.message === 'saldo-insuficiente' ? 'loja.semSaldo' : 'conta.erroConexao')
    } finally {
      setComprando(null)
    }
  }

  return (
    <div className="space-y-3" data-loja>
      {saldo != null ? (
        <p className="flex items-center justify-center gap-2 text-sm font-semibold" data-saldo-loja>
          <Oticoin tamanho={28} girando />
          {t('loja.saldo', { n: saldo })}
        </p>
      ) : (
        <p className="text-xs text-[#c9b48a]">{t('loja.entrar')}</p>
      )}
      <p className="text-xs text-[#c9b48a]">{t('loja.explicacao')}</p>
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}
      <div className="space-y-2">
        {Object.entries(ITENS).map(([id, item]) => {
          const [parte, opcao] = id.split(':')
          const pecas = pecasDoItem(parte, opcao)
          const rotuloDaParte = t((parte === 'arma' ? `personalizacao.arma.${pecas?.[0]}` : `personalizacao.parte.${parte}`) as ChaveTexto)
          const liberado = opcaoLiberada(personalizacao, parte, opcao)
          const conquista = CONQUISTAS.find((c) => c.id === item.conquista)
          return (
            <div key={id} className="flex items-center justify-between gap-3 rounded-lg bg-[#2a1c10] px-3 py-2" data-item={id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {t(`personalizacao.opcao.${opcao}` as ChaveTexto)} <span className="font-normal text-[#c9b48a]">· {rotuloDaParte}</span>
                </p>
                <p className="truncate text-[0.65rem] text-[#c9b48a]">
                  {pecas ? pecas.map((p) => t(`personalizacao.peca.${p}` as ChaveTexto)).join(', ') : t('loja.todasAsPecas')}
                  {conquista && !liberado ? ` · ${t('loja.ouConquista', { conquista: nomeDaConquista(t, conquista) })}` : ''}
                </p>
              </div>
              {liberado ? (
                <span className="shrink-0 text-xs font-semibold text-[#9fe0a8]">✓ {t('loja.liberado')}</span>
              ) : (
                <button
                  type="button"
                  disabled={saldo == null || saldo < item.preco || comprando !== null}
                  onClick={() => void comprar(id)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-[#c9a24a]/60 px-2.5 py-1.5 text-xs font-semibold text-[#f5e6c8] transition enabled:hover:bg-[#3a2614] disabled:opacity-50"
                >
                  {t('loja.comprar')}
                  <Oticoin tamanho={16} />
                  {item.preco}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
