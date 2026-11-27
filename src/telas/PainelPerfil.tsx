import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import type { ChaveTexto, Idioma, Traduzir } from '../textos/idiomas'
import { AVATARES, MOLDURAS, urlDoAvatar } from '../conta/aparencia'
import { prepararFoto } from '../conta/foto'
import { enviarFoto, lerMeuPerfil, listarSalas, mudarAparencia, useSessao, type Jogador, type SalaNaLista } from '../dados/servidor'
import { resultadoDaPartida, type PartidaXadrez } from '../dados/xadrezRepo'
import type { SituacaoDasConquistas } from '../conta/conquistas'
import { CONQUISTAS } from '../conta/conquistas'
import { Avatar, MeuId, Oticoin } from './ElementosDoJogador'
import { nomeDaConquista, PainelConquistas, romano } from './PainelConquistas'
import { escolherTitulo, guardarMeuTitulo, tituloLiberado, TITULOS, useMeuTitulo } from '../conta/titulos'

// Perfil de quem está jogando: quem é, a foto e a moldura, os números e o histórico das partidas.

const botaoCor = 'rounded-lg border border-[#c9a24a]/40 px-3 py-2 text-sm font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614] disabled:opacity-50'
const botaoLink = 'text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline disabled:opacity-50'
const HISTORICO_POR_VEZ = 30

type Desfecho = 'venceu' | 'perdeu' | 'empate'

interface ItemDoHistorico {
  id: string
  quando: number
  adversario: string
  desfecho: Desfecho
  /** Contra a máquina ou contra outra pessoa (a partida amistosa, entre amigos). */
  contra: 'maquina' | 'amigos'
  abrir: () => void
}

type FiltroDoResultado = 'todas' | Desfecho
type FiltroDoAdversario = 'todos' | 'amigos' | 'maquina'
type Aba = 'perfil' | 'configuracoes'
/** O que o Perfil mostra embaixo dos números: as partidas ou as conquistas. */
type Secao = 'partidas' | 'conquistas' | 'titulos'

/** Como o perfil estava quando a pessoa abriu uma partida dele: o "Voltar" da partida devolve tudo igual. */
interface PerfilLembrado {
  abertas: Record<Secao, boolean>
  filtroDoResultado: FiltroDoResultado
  filtroDoAdversario: FiltroDoAdversario
  quantos: number
  /** A partida tocada, pra lista voltar com ela à vista. */
  tocada: string
}
let lembrado: PerfilLembrado | null = null

// as seções abertas ou recolhidas ficam do jeito que a pessoa deixou (pedido do usuário), guardadas no aparelho. Na
// primeira vez, todas recolhidas
const CHAVE_DAS_SECOES = 'xadrezCaotico:secoesDoPerfil'
const TODAS_RECOLHIDAS: Record<Secao, boolean> = { partidas: false, conquistas: false, titulos: false }

function secoesGuardadas(): Record<Secao, boolean> {
  try {
    const lidas = JSON.parse(localStorage.getItem(CHAVE_DAS_SECOES) ?? '{}') as Partial<Record<Secao, unknown>>
    return { partidas: lidas.partidas === true, conquistas: lidas.conquistas === true, titulos: lidas.titulos === true }
  } catch {
    return TODAS_RECOLHIDAS
  }
}

function guardarSecoes(abertas: Record<Secao, boolean>) {
  try {
    localStorage.setItem(CHAVE_DAS_SECOES, JSON.stringify(abertas))
  } catch {
    // sem localStorage, vale só até fechar o jogo
  }
}

/** Um grupo de botões de filtro: um só marcado, com quantas partidas cada um mostra. */
function Filtro<T extends string>({ rotulo, valor, opcoes, onMudar }: { rotulo: string; valor: T; opcoes: { id: T; nome: string; quantas: number }[]; onMudar: (id: T) => void }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1" data-filtro={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onMudar(o.id)}
          data-opcao-filtro={o.id}
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${valor === o.id ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'}`}
        >
          {o.nome} <span className="opacity-70">({o.quantas})</span>
        </button>
      ))}
    </div>
  )
}

const ROTULO_DO_DESFECHO: Record<Desfecho, ChaveTexto> = { venceu: 'online.listaVenceu', perdeu: 'online.listaPerdeu', empate: 'online.listaEmpate' }
const COR_DO_DESFECHO: Record<Desfecho, string> = { venceu: 'text-[#9fe0a8]', perdeu: 'text-[#ffb4a8]', empate: 'text-[#c9b48a]' }

/** Os títulos: cada um com as conquistas que pede, e o botão de usar quando liberado. */
function SecaoDosTitulos({ t, recebidas, tudoLiberado, comConta }: { t: Traduzir; recebidas: string[]; tudoLiberado: boolean; comConta: boolean }) {
  const meuTitulo = useMeuTitulo()
  const [trocando, setTrocando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const trocar = (titulo: string | null) => {
    setTrocando(true)
    setFalhou(false)
    escolherTitulo(titulo)
      .catch(() => setFalhou(true))
      .finally(() => setTrocando(false))
  }
  return (
    <div className="space-y-2" data-titulos>
      <p className="text-xs text-[#c9b48a]">{t(comConta ? 'perfil.tituloDica' : 'perfil.tituloEntrar')}</p>
      {falhou && <p className="text-xs font-medium text-[#ffb4a8]">{t('conta.erroConexao')}</p>}
      {TITULOS.map((titulo) => {
        const liberado = comConta && tituloLiberado(titulo, recebidas, tudoLiberado)
        const emUso = meuTitulo === titulo.id
        return (
          <div key={titulo.id} className="rounded-lg bg-[#2a1c10] px-3 py-2" data-titulo={titulo.id} data-liberado={liberado || undefined}>
            <div className="flex items-center justify-between gap-3">
              <p className={`font-display text-base font-bold tracking-[0.2em] ${liberado ? 'text-[#e6c675]' : 'text-[#c9b48a]/70'}`}>
                {liberado ? '' : '🔒 '}
                {t(`titulo.${titulo.id}` as ChaveTexto)}
              </p>
              {liberado &&
                (emUso ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[#9fe0a8]">✓ {t('perfil.tituloEmUso')}</span>
                    <button type="button" className={botaoLink} disabled={trocando} onClick={() => trocar(null)}>
                      {t('perfil.tituloTirar')}
                    </button>
                  </span>
                ) : (
                  <button type="button" disabled={trocando} onClick={() => trocar(titulo.id)} className="rounded-full border border-[#e6c675] bg-[#c9a24a] px-3 py-1 text-xs font-semibold text-[#1c120a] disabled:opacity-60">
                    {t('perfil.tituloUsar')}
                  </button>
                ))}
            </div>
            {!liberado && comConta && <p className="mt-1 text-[0.7rem] text-[#c9b48a]">{t('perfil.tituloBloqueado')}</p>}
            <ul className="mt-1.5 space-y-0.5">
              {titulo.conquistas.map((id, i) => {
                const conquista = CONQUISTAS.find((c) => c.id === id)
                if (!conquista) return null
                const feita = recebidas.includes(id)
                return (
                  <li key={id} className={`text-xs ${feita ? 'text-[#9fe0a8]' : 'text-[#c9b48a]'}`}>
                    {feita ? '✓' : '○'} {t(`conquistas.serie.${titulo.serie}` as ChaveTexto)} {romano(i + 1)} · {nomeDaConquista(t, conquista)}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function desfechoDaSala(sala: SalaNaLista): Desfecho {
  if (sala.resultado === 'empate') return 'empate'
  return (sala.resultado === 'brancas') === (sala.minhaCor === 'w') ? 'venceu' : 'perdeu'
}

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
  onVerPartida,
  onAbrirSala,
  onEntrar,
  conquistas,
  children,
  abaInicial,
  voltandoDaPartida = false,
}: {
  t: Traduzir
  idioma: Idioma
  /** Partidas terminadas contra a máquina, salvas neste aparelho e na conta. */
  partidas: PartidaXadrez[]
  onVerPartida: (partida: PartidaXadrez) => void
  onAbrirSala: (codigo: string) => void
  onEntrar: () => void
  /** O que já foi alcançado e o saldo de óticoins; null enquanto confere. */
  conquistas: SituacaoDasConquistas | null
  /** As configurações do jogo, que moram no fim do perfil. */
  children: ReactNode
  /** A aba que abre: quem volta da privacidade volta para as Configurações. */
  abaInicial?: Aba
  /** Voltando de uma partida aberta daqui: o perfil volta como estava. */
  voltandoDaPartida?: boolean
}) {

  const sessao = useSessao()
  // lido uma vez: o aviso de volta só vale na abertura
  const [antes] = useState(() => (voltandoDaPartida ? lembrado : null))
  const token = sessao?.token
  const [perfil, setPerfil] = useState<Awaited<ReturnType<typeof lerMeuPerfil>> | null>(null)
  const [salas, setSalas] = useState<SalaNaLista[]>([])
  const [falhou, setFalhou] = useState(false)
  const [editando, setEditando] = useState(false)
  const [quantos, setQuantos] = useState(antes?.quantos ?? HISTORICO_POR_VEZ)
  const [aba, setAba] = useState<Aba>(abaInicial ?? 'perfil')
  // as partidas, as conquistas e os títulos são seções recolhíveis (pedido do usuário): abrem como ficaram da última vez
  const [abertas, setAbertas] = useState<Record<Secao, boolean>>(() => antes?.abertas ?? secoesGuardadas())
  const [filtroDoResultado, setFiltroDoResultado] = useState<FiltroDoResultado>(antes?.filtroDoResultado ?? 'todas')
  const [filtroDoAdversario, setFiltroDoAdversario] = useState<FiltroDoAdversario>(antes?.filtroDoAdversario ?? 'todos')
  // de volta da partida, a que foi tocada aparece no meio da tela
  useEffect(() => {
    if (!antes) return
    const quadro = requestAnimationFrame(() => document.querySelector(`[data-id-da-partida="${CSS.escape(antes.tocada)}"]`)?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(quadro)
  }, [antes])

  useEffect(() => {
    if (!token) return
    let cancelado = false
    Promise.all([lerMeuPerfil(), listarSalas()])
      .then(([meu, lista]) => {
        if (cancelado) return
        setPerfil(meu)
        guardarMeuTitulo(meu.titulo)
        setSalas(lista.salas.filter((s) => s.status === 'fim'))
      })
      .catch(() => {
        if (!cancelado) setFalhou(true)
      })
    return () => {
      cancelado = true
    }
  }, [token])

  const historico = useMemo(() => {
    const itens: ItemDoHistorico[] = [
      ...partidas.map((p) => ({
        id: p.id,
        quando: p.atualizadaEm,
        // a blitz aparece com o ritmo
        adversario: p.relogio ? `${t('perfil.maquina')} · ${t('blitz.titulo', { ritmo: p.relogio.ritmo })}` : t('perfil.maquina'),
        desfecho: resultadoDaPartida(p),
        contra: 'maquina' as const,
        abrir: () => onVerPartida(p),
      })),
      ...(token ? salas : []).map((s) => ({
        id: s.codigo,
        quando: s.atualizadaEm,
        adversario: (s.minhaCor === 'w' ? s.pretas : s.brancas) ?? '…',
        desfecho: desfechoDaSala(s),
        contra: 'amigos' as const,
        abrir: () => onAbrirSala(s.codigo),
      })),
    ]
    return itens.sort((a, b) => b.quando - a.quando)
  }, [partidas, salas, token, t, onVerPartida, onAbrirSala])

  // as conquistas recebidas: as do servidor (no perfil) e as que acabaram de entrar (na situação das conquistas)
  const recebidas = [...new Set([...(perfil?.conquistas ?? []), ...(conquistas?.recebidas ?? [])])]
  const feitas = conquistas ? CONQUISTAS.filter((c) => conquistas.contagem[c.medida] >= c.meta).length : 0
  /** Um grupo de abas: as do topo (o perfil e as configurações) e as de dentro do perfil (partidas e conquistas). */
  const grupoDeAbas = <T extends string>(rotulo: string, atual: T, mudar: (id: T) => void, itens: readonly (readonly [T, string])[]) => (
    <div role="tablist" aria-label={rotulo} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map(([id, nome]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={atual === id}
          onClick={() => mudar(id)}
          className={`truncate rounded-lg border px-1 py-1.5 text-xs font-semibold transition ${atual === id ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'}`}
        >
          {nome}
        </button>
      ))}
    </div>
  )
  // o perfil em abas, pra não virar uma página só comprida: o perfil e as configurações. As partidas e as conquistas
  // ficam dentro do perfil (pedido do usuário), em abas embaixo dos números
  const abas = grupoDeAbas<Aba>(t('menu.perfil'), aba, setAba, [
    ['perfil', t('menu.perfil')],
    ['configuracoes', t('menu.configuracoes')],
  ])
  // as partidas: o histórico inteiro primeiro; os filtros juntam o resultado e contra quem (pedido do usuário)
  const mostrarPartidas = () => {
    // o histórico inteiro primeiro; os filtros juntam o resultado e contra quem (pedido do usuário). Cada opção mostra
    // quantas partidas ela daria, já com o outro filtro aplicado
    const doAdversario = (item: ItemDoHistorico, filtro: FiltroDoAdversario) => filtro === 'todos' || item.contra === filtro
    const doResultado = (item: ItemDoHistorico, filtro: FiltroDoResultado) => filtro === 'todas' || item.desfecho === filtro
    const filtrado = historico.filter((item) => doAdversario(item, filtroDoAdversario) && doResultado(item, filtroDoResultado))
    const quantasComResultado = (filtro: FiltroDoResultado) => historico.filter((item) => doAdversario(item, filtroDoAdversario) && doResultado(item, filtro)).length
    const quantasContra = (filtro: FiltroDoAdversario) => historico.filter((item) => doResultado(item, filtroDoResultado) && doAdversario(item, filtro)).length
    return (
      <div className="space-y-3" data-partidas>
        <Filtro<FiltroDoResultado>
          rotulo={t('perfil.filtroResultado')}
          valor={filtroDoResultado}
          onMudar={(filtro) => {
            setFiltroDoResultado(filtro)
            setQuantos(HISTORICO_POR_VEZ)
          }}
          opcoes={(
            [
              ['todas', 'perfil.filtroTodas'],
              ['venceu', 'perfil.filtroVitorias'],
              ['empate', 'perfil.filtroEmpates'],
              ['perdeu', 'perfil.filtroDerrotas'],
            ] as const
          ).map(([id, chave]) => ({ id, nome: t(chave), quantas: quantasComResultado(id) }))}
        />
        <Filtro<FiltroDoAdversario>
          rotulo={t('perfil.filtroAdversario')}
          valor={filtroDoAdversario}
          onMudar={(filtro) => {
            setFiltroDoAdversario(filtro)
            setQuantos(HISTORICO_POR_VEZ)
          }}
          opcoes={(
            [
              ['todos', 'perfil.filtroTodos'],
              ['amigos', 'perfil.filtroAmigos'],
              ['maquina', 'perfil.filtroMaquina'],
            ] as const
          ).map(([id, chave]) => ({ id, nome: t(chave), quantas: quantasContra(id) }))}
        />
        {historico.length === 0 ? (
          <p className="text-xs text-[#c9b48a]">{t('perfil.historicoVazio')}</p>
        ) : (
          filtrado.length === 0 && <p className="text-xs text-[#c9b48a]" data-sem-partidas-no-filtro>{t('perfil.historicoNoFiltro')}</p>
        )}
        <div className="space-y-0.5" data-historico>
          {filtrado.slice(0, quantos).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                lembrado = { abertas, filtroDoResultado, filtroDoAdversario, quantos, tocada: item.id }
                item.abrir()
              }}
              data-id-da-partida={item.id}
              data-partida={item.contra} data-desfecho={item.desfecho} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[#3a2614]">
              <span className="min-w-0 truncate">
                {t('online.contra', { nome: item.adversario })} <span className="text-[#c9b48a]">· {new Date(item.quando).toLocaleDateString(idioma)}</span>
              </span>
              <span className={`shrink-0 font-semibold ${COR_DO_DESFECHO[item.desfecho]}`}>{t(ROTULO_DO_DESFECHO[item.desfecho])}</span>
            </button>
          ))}
        </div>
        {filtrado.length > quantos && (
          <button type="button" className={botaoLink} onClick={() => setQuantos((n) => n + HISTORICO_POR_VEZ)}>
            {t('perfil.verMais')}
          </button>
        )}
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

      <div className="space-y-2" data-secoes-do-perfil>
        {(
          [
            ['partidas', t('perfil.abaPartidas', { n: historico.length }), mostrarPartidas],
            ['conquistas', t('perfil.abaConquistas', { feitas, total: CONQUISTAS.length }), () => <PainelConquistas t={t} situacao={conquistas} />],
            [
              'titulos',
              t('perfil.abaTitulos', { feitos: TITULOS.filter((titulo) => token && tituloLiberado(titulo, recebidas, perfil?.tudoLiberado)).length, total: TITULOS.length }),
              () => <SecaoDosTitulos t={t} recebidas={recebidas} tudoLiberado={!!perfil?.tudoLiberado} comConta={!!token} />,
            ],
          ] as const
        ).map(([id, nome, conteudo]) => (
          <section key={id} className="rounded-xl border border-[#c9a24a]/30" data-secao-do-perfil={id}>
            <button
              type="button"
              aria-expanded={abertas[id]}
              aria-controls={`perfil-${id}`}
              onClick={() =>
                setAbertas((atual) => {
                  const novas = { ...atual, [id]: !atual[id] }
                  guardarSecoes(novas)
                  return novas
                })
              }
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-[#3a2614]"
            >
              {nome}
              <span aria-hidden className={`text-xs text-[#c9a24a] transition-transform ${abertas[id] ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {abertas[id] && (
              <div id={`perfil-${id}`} className="px-3 pb-3">
                {conteudo()}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
