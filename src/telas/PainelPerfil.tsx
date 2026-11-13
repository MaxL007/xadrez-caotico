import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import type { ChaveTexto, Idioma, Traduzir } from '../textos/idiomas'
import { AVATARES, MOLDURAS, urlDoAvatar } from '../conta/aparencia'
import { prepararFoto } from '../conta/foto'
import { enviarFoto, lerMeuPerfil, listarSalas, mudarAparencia, useSessao, type Jogador, type Retrospecto, type SalaNaLista } from '../dados/servidor'
import { resultadoDaPartida, type PartidaXadrez } from '../dados/xadrezRepo'
import type { SituacaoDasConquistas } from '../conta/conquistas'
import { CONQUISTAS } from '../conta/conquistas'
import { Avatar, MeuId, Oticoin, Placar } from './ElementosDoJogador'
import { PainelConquistas } from './PainelConquistas'

// Perfil de quem está jogando: quem é, a foto e a moldura, os números e o histórico das partidas.

const botaoCor = 'rounded-lg border border-[#c9a24a]/40 px-3 py-2 text-sm font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614] disabled:opacity-50'
const botaoLink = 'text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline disabled:opacity-50'
const secao = 'space-y-2 border-t border-[#c9a24a]/20 pt-3'
const HISTORICO_POR_VEZ = 30

type Desfecho = 'venceu' | 'perdeu' | 'empate'

interface ItemDoHistorico {
  id: string
  quando: number
  adversario: string
  desfecho: Desfecho
  abrir: () => void
}

const ROTULO_DO_DESFECHO: Record<Desfecho, ChaveTexto> = { venceu: 'online.listaVenceu', perdeu: 'online.listaPerdeu', empate: 'online.listaEmpate' }
const COR_DO_DESFECHO: Record<Desfecho, string> = { venceu: 'text-[#9fe0a8]', perdeu: 'text-[#ffb4a8]', empate: 'text-[#c9b48a]' }

function desfechoDaSala(sala: SalaNaLista): Desfecho {
  if (sala.resultado === 'empate') return 'empate'
  return (sala.resultado === 'brancas') === (sala.minhaCor === 'w') ? 'venceu' : 'perdeu'
}

function contarContraMaquina(partidas: PartidaXadrez[]): Retrospecto {
  const desfechos = partidas.map(resultadoDaPartida)
  const contar = (desfecho: Desfecho) => desfechos.filter((d) => d === desfecho).length
  return { partidas: partidas.length, vitorias: contar('venceu'), derrotas: contar('perdeu'), empates: contar('empate') }
}

const SEM_PARTIDAS: Retrospecto = { partidas: 0, vitorias: 0, derrotas: 0, empates: 0 }

function EscolherAparencia({
  t,
  jogador,
  moldurasLiberadas,
  onMudar,
}: {
  t: Traduzir
  jogador: Pick<Jogador, 'idJogador' | 'avatar' | 'moldura'>
  /** Por enquanto, só a conta com tudo liberado; as outras veem as molduras trancadas. */
  moldurasLiberadas: boolean
  onMudar: (mudanca: { avatar?: string; moldura?: string }) => void
}) {
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function aoEscolherFoto(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setEnviando(true)
    setErro(null)
    try {
      onMudar(await enviarFoto(await prepararFoto(arquivo)))
    } catch {
      setErro('perfil.erroFoto')
    } finally {
      setEnviando(false)
    }
  }

  async function escolher(mudanca: { avatar?: string; moldura?: string }) {
    setErro(null)
    try {
      await mudarAparencia(mudanca)
      onMudar(mudanca)
    } catch {
      setErro('conta.erroConexao')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#c9a24a]/20 p-3" data-editor-perfil>
      <label className={`${botaoCor} block cursor-pointer text-center ${enviando ? 'opacity-50' : ''}`}>
        {t(enviando ? 'perfil.enviandoFoto' : 'perfil.importarFoto')}
        <input type="file" accept="image/*" className="sr-only" disabled={enviando} onChange={aoEscolherFoto} />
      </label>
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}
      <div>
        <p className="mb-1.5 text-xs font-medium text-[#c9b48a]">{t('perfil.sugestoes')}</p>
        <div className="grid grid-cols-6 gap-1.5">
          {AVATARES.map((avatar, i) => (
            <button
              key={avatar}
              type="button"
              aria-label={t('perfil.usarAvatar', { n: i + 1 })}
              aria-pressed={jogador.avatar === avatar}
              onClick={() => void escolher({ avatar })}
              className={`overflow-hidden rounded-full border-2 transition hover:border-[#e6c675] ${jogador.avatar === avatar ? 'border-[#e6c675]' : 'border-transparent'}`}
            >
              <img src={urlDoAvatar(avatar)} alt="" className="aspect-square w-full" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-[#c9b48a]">{t('perfil.molduras')}</p>
        {!moldurasLiberadas && <p className="mb-1.5 text-xs text-[#c9b48a]">{t('perfil.moldurasBloqueadas')}</p>}
        <div className="grid grid-cols-5 gap-2">
          {MOLDURAS.map((moldura) => {
            const nome = t(`perfil.moldura.${moldura}` as ChaveTexto)
            const trancada = !moldurasLiberadas && moldura !== 'nenhuma'
            return (
              <button
                key={moldura}
                type="button"
                aria-label={trancada ? t('perfil.molduraBloqueada', { nome }) : nome}
                aria-pressed={(jogador.moldura ?? 'nenhuma') === moldura}
                disabled={trancada}
                onClick={() => void escolher({ moldura })}
                className={`relative flex flex-col items-center gap-1 rounded-lg p-1 pt-2 text-[0.6rem] transition enabled:hover:bg-[#3a2614] disabled:cursor-not-allowed ${(jogador.moldura ?? 'nenhuma') === moldura ? 'bg-[#3a2614] text-[#f5e6c8]' : 'text-[#c9b48a]'}`}
              >
                <span className={trancada ? 'opacity-40 grayscale' : ''}>
                  <Avatar jogador={{ ...jogador, moldura }} tamanho={42} />
                </span>
                {trancada && (
                  <span aria-hidden className="absolute left-1/2 top-4 -translate-x-1/2 text-sm">
                    🔒
                  </span>
                )}
                <span className={`w-full truncate text-center ${trancada ? 'opacity-60' : ''}`}>{nome}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function PainelPerfil({
  t,
  idioma,
  partidas,
  comHistorico,
  onVerPartida,
  onAbrirSala,
  onEntrar,
  conquistas,
  children,
}: {
  t: Traduzir
  idioma: Idioma
  /** Partidas terminadas contra a máquina, salvas neste aparelho e na conta. */
  partidas: PartidaXadrez[]
  comHistorico: boolean
  onVerPartida: (partida: PartidaXadrez) => void
  onAbrirSala: (codigo: string) => void
  onEntrar: () => void
  /** O que já foi alcançado e o saldo de óticoins; null enquanto confere. */
  conquistas: SituacaoDasConquistas | null
  /** As configurações do jogo, que moram no fim do perfil. */
  children: ReactNode
}) {
  const sessao = useSessao()
  const token = sessao?.token
  const [perfil, setPerfil] = useState<Awaited<ReturnType<typeof lerMeuPerfil>> | null>(null)
  const [salas, setSalas] = useState<SalaNaLista[]>([])
  const [falhou, setFalhou] = useState(false)
  const [editando, setEditando] = useState(false)
  const [quantos, setQuantos] = useState(HISTORICO_POR_VEZ)
  const [aba, setAba] = useState<'perfil' | 'conquistas' | 'configuracoes'>('perfil')

  useEffect(() => {
    if (!token) return
    let cancelado = false
    Promise.all([lerMeuPerfil(), listarSalas()])
      .then(([meu, lista]) => {
        if (cancelado) return
        setPerfil(meu)
        setSalas(lista.salas.filter((s) => s.status === 'fim'))
      })
      .catch(() => {
        if (!cancelado) setFalhou(true)
      })
    return () => {
      cancelado = true
    }
  }, [token])

  const contraMaquina = useMemo(() => contarContraMaquina(partidas), [partidas])
  const amistosas = (token && perfil?.geral) || SEM_PARTIDAS
  const total: Retrospecto = {
    partidas: contraMaquina.partidas + amistosas.partidas,
    vitorias: contraMaquina.vitorias + amistosas.vitorias,
    derrotas: contraMaquina.derrotas + amistosas.derrotas,
    empates: contraMaquina.empates + amistosas.empates,
  }

  const historico = useMemo(() => {
    const itens: ItemDoHistorico[] = [
      ...partidas.map((p) => ({ id: p.id, quando: p.atualizadaEm, adversario: t('perfil.maquina'), desfecho: resultadoDaPartida(p), abrir: () => onVerPartida(p) })),
      ...(token ? salas : []).map((s) => ({
        id: s.codigo,
        quando: s.atualizadaEm,
        adversario: (s.minhaCor === 'w' ? s.pretas : s.brancas) ?? '…',
        desfecho: desfechoDaSala(s),
        abrir: () => onAbrirSala(s.codigo),
      })),
    ]
    return itens.sort((a, b) => b.quando - a.quando)
  }, [partidas, salas, token, t, onVerPartida, onAbrirSala])

  const feitas = conquistas ? CONQUISTAS.filter((c) => conquistas.contagem[c.medida] >= c.meta).length : 0
  // o perfil em abas, pra não virar uma página só comprida: o perfil, as conquistas e as configurações
  const abas = (
    <div role="tablist" aria-label={t('menu.perfil')} className="grid grid-cols-3 gap-1">
      {(
        [
          ['perfil', t('menu.perfil')],
          ['conquistas', t('perfil.abaConquistas', { feitas, total: CONQUISTAS.length })],
          ['configuracoes', t('menu.configuracoes')],
        ] as const
      ).map(([id, nome]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={aba === id}
          onClick={() => setAba(id)}
          className={`truncate rounded-lg border px-1 py-1.5 text-xs font-semibold transition ${aba === id ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'}`}
        >
          {nome}
        </button>
      ))}
    </div>
  )
  if (aba === 'conquistas') {
    return (
      <div className="space-y-4">
        {abas}
        <PainelConquistas t={t} situacao={conquistas} />
      </div>
    )
  }
  if (aba === 'configuracoes') {
    return (
      <div className="space-y-2" data-configuracoes>
        {abas}
        <div>{children}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {abas}
      {token && perfil ? (
        <>
          <div className="flex items-center gap-4 pt-2">
            <Avatar jogador={perfil} tamanho={88} />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-semibold">{perfil.nome}</p>
              <p className="text-xs text-[#c9b48a]">{t('amigos.perfilDesde', { data: new Date(perfil.desde).toLocaleDateString(idioma) })}</p>
              <button type="button" className={`${botaoLink} mt-1`} onClick={() => setEditando((v) => !v)}>
                {t(editando ? 'perfil.concluir' : 'perfil.mudarAparencia')}
              </button>
            </div>
          </div>
          {editando && <EscolherAparencia t={t} jogador={perfil} moldurasLiberadas={perfil.tudoLiberado} onMudar={(mudanca) => setPerfil({ ...perfil, ...mudanca })} />}
          <MeuId t={t} id={perfil.idJogador} />
        </>
      ) : (
        !token && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('conta.convidado')}</p>
            <p className="text-xs text-[#c9b48a]">{t('perfil.convidadoDica')}</p>
            <button type="button" className={`${botaoCor} w-full`} onClick={onEntrar}>
              {t('perfil.entrar')}
            </button>
          </div>
        )
      )}
      {token && falhou && <p className="text-xs font-medium text-[#ffb4a8]">{t('conta.erroConexao')}</p>}

      {conquistas?.oticoins != null && (
        <p className="flex items-center gap-2 text-sm font-semibold" data-saldo-perfil>
          <Oticoin tamanho={28} girando />
          {t('perfil.oticoins', { n: conquistas.oticoins })}
        </p>
      )}

      <div className={secao}>
        <Placar t={t} retrospecto={total} />
        <p className="text-xs text-[#c9b48a]" data-placar-maquina>
          {t('perfil.contraMaquina', { v: contraMaquina.vitorias, d: contraMaquina.derrotas, e: contraMaquina.empates })}
        </p>
        <p className="text-xs text-[#c9b48a]" data-placar-amistosas>
          {t('perfil.amistosas', { v: amistosas.vitorias, d: amistosas.derrotas, e: amistosas.empates })}
        </p>
      </div>

      {comHistorico && (
        <div className={secao}>
          <p className="text-sm font-medium">{t('perfil.historico')}</p>
          {historico.length === 0 && <p className="text-xs text-[#c9b48a]">{t('perfil.historicoVazio')}</p>}
          <div className="space-y-0.5" data-historico>
            {historico.slice(0, quantos).map((item) => (
              <button key={item.id} type="button" onClick={item.abrir} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[#3a2614]">
                <span className="min-w-0 truncate">
                  {t('online.contra', { nome: item.adversario })} <span className="text-[#c9b48a]">· {new Date(item.quando).toLocaleDateString(idioma)}</span>
                </span>
                <span className={`shrink-0 font-semibold ${COR_DO_DESFECHO[item.desfecho]}`}>{t(ROTULO_DO_DESFECHO[item.desfecho])}</span>
              </button>
            ))}
          </div>
          {historico.length > quantos && (
            <button type="button" className={botaoLink} onClick={() => setQuantos((n) => n + HISTORICO_POR_VEZ)}>
              {t('perfil.verMais')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
