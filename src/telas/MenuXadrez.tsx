import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { ConfigXadrez, QualidadeXadrez } from '../jogo/configXadrez'
import { IDIOMAS, type ChaveTexto, type Idioma, type Traduzir } from '../textos/idiomas'
import { useResumoDaNuvem } from '../dados/db'
import { useAmigos, useSessao } from '../dados/servidor'
import { importarPartidas, type PartidaXadrez } from '../dados/xadrezRepo'
import { useFecharComEsc } from '../app/teclaEsc'
import { PainelAmigos } from './PainelAmigos'
import { PainelConta } from './PainelConta'
import { PainelPerfil } from './PainelPerfil'
import { PainelPersonalizacao } from './PainelPersonalizacao'
import { nomeDaConquista } from './PainelConquistas'
import { Avatar, Oticoin } from './ElementosDoJogador'
import { RECOMPENSAS_POR_HORA, verificarConquistas, type Conquista, type SituacaoDasConquistas } from '../conta/conquistas'
import { carregarPersonalizacao } from '../conta/personalizacao'
import { PainelLoja } from './PainelLoja'
import { PainelPrivacidade } from './PainelPrivacidade'
import { marcarPasseioVisto, PasseioInicial, passeioJaVisto, passeioNaAutomacao } from './PasseioInicial'
import { instalarAplicativo, useAplicativo } from '../app/aplicativo'
import { avisosJaPerguntados, avisosSuportados, desligarAvisos, ligarAvisos, manterAvisos, marcarAvisosPerguntados, situacaoDosAvisos, type SituacaoDosAvisos } from '../app/notificacoes'
import { dispensarAvisoDoConvite, guardarPedidosAvisados, pedidosAvisados, useConviteDeAmizade } from '../conta/conviteDeAmizade'
import type { VitrineDaPeca } from '../tabuleiro/pecas/equipamentos'
import type * as THREE from 'three'

// -----------------------------------------------------------------------
// Tela inicial do jogo: fica por cima do próprio tabuleiro 3D, visto de lado
// (brancas de um lado, pretas do outro). As cores são fixas, de madeira e ouro:
// o fundo é sempre o tabuleiro, então não muda com o tema claro/escuro do site.
// -----------------------------------------------------------------------

const botaoMenu =
  'w-full rounded-xl border border-[#c9a24a]/70 bg-[#1c120a]/90 px-2 py-1.5 font-display text-sm font-semibold text-[#f5e6c8] shadow-lg transition hover:bg-[#3a2614] hover:border-[#e6c675] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c675] sm:px-5 sm:py-2.5 sm:text-base'
const avisoFlutuante = 'flex items-center gap-2 rounded-xl border border-[#e6c675] bg-[#1c120a]/95 text-sm font-semibold text-[#f5e6c8] shadow-xl'
const painelMenu =
  'w-full max-w-md max-h-full overflow-y-auto rounded-2xl border border-[#c9a24a]/60 bg-[#1c120a]/95 p-5 text-[#f5e6c8] shadow-2xl max-sm:fixed max-sm:inset-2 max-sm:z-20 max-sm:max-h-none max-sm:w-auto max-sm:max-w-none max-sm:bg-[#1c120a]'

function Linha({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#c9a24a]/20 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        {dica && <p className="text-xs text-[#c9b48a]">{dica}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Alternador({ rotulo, ligado, onMudar }: { rotulo: string; ligado: boolean; onMudar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onMudar(!ligado)}
      className={`relative h-6 w-11 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c675] ${ligado ? 'bg-[#c9a24a]' : 'bg-[#5a4630]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#fff8e8] shadow transition-all ${ligado ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  )
}

function Opcoes<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMudar,
}: {
  rotulo: string
  valor: T
  opcoes: { id: T; nome: string }[]
  onMudar: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap justify-end gap-1">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onMudar(o.id)}
          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c675] ${
            valor === o.id ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'
          }`}
        >
          {o.nome}
        </button>
      ))}
    </div>
  )
}

function Volume({ rotulo, valor, minimo = 0, desligado, onMudar }: { rotulo: string; valor: number; minimo?: number; desligado: boolean; onMudar: (v: number) => void }) {
  return (
    <input
      type="range"
      aria-label={rotulo}
      aria-valuetext={`${Math.round(valor * 100)}%`}
      min={minimo}
      max={1}
      step={0.05}
      value={valor}
      disabled={desligado}
      onChange={(e) => onMudar(Number(e.target.value))}
      className="w-32 accent-[#c9a24a] disabled:opacity-40"
    />
  )
}

/** Só aparece abrindo o jogo com ?importar=1: serve pra trazer partidas de um arquivo uma única vez. */
function ImportarPartidas({ t, onImportou }: { t: Traduzir; onImportou: () => void }) {
  const sessao = useSessao()
  const { pendentes } = useResumoDaNuvem()
  const entrada = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState('')

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo || !sessao) return
    try {
      setAviso(t('importar.ok', { n: await importarPartidas(await arquivo.text(), sessao.usuario.nome) }))
      onImportou()
    } catch {
      setAviso(t('importar.erro'))
    }
  }

  return (
    <Linha titulo={t('importar.titulo')} dica={aviso || (pendentes > 0 ? t('conta.nuvemPendentes', { n: pendentes }) : t('importar.dica'))}>
      <input ref={entrada} type="file" accept=".json,application/json" className="text-xs" disabled={!sessao} onChange={aoEscolher} aria-label={t('importar.titulo')} />
    </Linha>
  )
}

const botaoPequeno = 'rounded-lg border border-[#c9a24a]/50 px-3 py-1 text-xs font-semibold hover:bg-[#3a2614]'

/** Os avisos com o jogo fechado (a vez numa partida online, convites, o fim da partida): ligar pede a permissão do
 * aparelho e precisa da conta. Só aparece onde o navegador sabe mostrá-los (o site publicado, com service worker). */
function AvisosComOJogoFechado({ t, idioma }: { t: Traduzir; idioma: Idioma }) {
  const sessao = useSessao()
  const [situacao, setSituacao] = useState<SituacaoDosAvisos | null>(null)
  const [mudando, setMudando] = useState(false)
  useEffect(() => {
    let vivo = true
    void situacaoDosAvisos().then((s) => vivo && setSituacao(s))
    return () => {
      vivo = false
    }
  }, [sessao?.usuario.id])
  if (!avisosSuportados() || !situacao || situacao === 'sem-suporte') return null
  const dica = !sessao ? t('config.avisosSemConta') : situacao === 'bloqueados' ? t('config.avisosBloqueados') : t('config.avisosDica')
  return (
    <Linha titulo={t('config.avisos')} dica={dica}>
      <Alternador
        rotulo={t('config.avisos')}
        ligado={situacao === 'ligados'}
        onMudar={(ligar) => {
          if (mudando || !sessao || situacao === 'bloqueados') return
          marcarAvisosPerguntados(sessao.usuario.id)
          setMudando(true)
          void (ligar ? ligarAvisos(idioma) : desligarAvisos())
            .then(setSituacao)
            .catch(() => situacaoDosAvisos().then(setSituacao))
            .finally(() => setMudando(false))
        }}
      />
    </Linha>
  )
}

/**
 * A pergunta dos avisos, logo depois de entrar na conta (pedido do usuário, 27/11): uma vez só por conta neste aparelho,
 * e só onde o aparelho sabe mostrar os avisos e eles ainda estão desligados. Ativar pede a permissão do aparelho (no
 * toque, como o navegador exige); depois, só nas Configurações.
 */
function PerguntaDosAvisos({ t, idioma }: { t: Traduzir; idioma: Idioma }) {
  const sessao = useSessao()
  const usuario = sessao?.usuario.id
  const [perguntar, setPerguntar] = useState(false)
  const [ativando, setAtivando] = useState(false)
  useEffect(() => {
    setPerguntar(false)
    // os testes automáticos não veem a pergunta (cobriria os botões), como o passeio
    if (!usuario || !avisosSuportados() || avisosJaPerguntados(usuario) || navigator.webdriver) return
    let vivo = true
    void situacaoDosAvisos().then((s) => {
      if (!vivo) return
      // já ligados ou bloqueados no aparelho: não há o que perguntar
      if (s === 'desligados') setPerguntar(true)
      else marcarAvisosPerguntados(usuario)
    })
    return () => {
      vivo = false
    }
  }, [usuario])
  if (!perguntar || !usuario) return null
  const responder = (ativar: boolean) => {
    marcarAvisosPerguntados(usuario)
    if (!ativar) {
      setPerguntar(false)
      return
    }
    setAtivando(true)
    void ligarAvisos(idioma)
      .catch(() => undefined)
      .finally(() => setPerguntar(false))
  }
  return (
    <div role="dialog" aria-label={t('avisos.pergunta')} className="absolute left-1/2 top-14 z-20 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-[#c9a24a]/60 bg-[#1c120a]/95 p-4 text-[#f5e6c8] shadow-xl" data-pergunta-avisos>
      <p className="flex items-center gap-2 font-display text-base font-semibold">
        <img src={`${import.meta.env.BASE_URL}icones/icone-192.png`} alt="" aria-hidden className="h-6 w-6" />
        {t('avisos.pergunta')}
      </p>
      <p className="mt-1.5 text-xs leading-snug text-[#c9b48a]">{t('config.avisosDica')}</p>
      <p className="mt-1 text-[0.7rem] text-[#c9b48a]/80">{t('avisos.depois')}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={botaoPequeno} disabled={ativando} onClick={() => responder(false)}>
          {t('avisos.agoraNao')}
        </button>
        <button type="button" disabled={ativando} onClick={() => responder(true)} className="rounded-lg border border-[#e6c675] bg-[#c9a24a] px-3 py-1 text-xs font-semibold text-[#1c120a] hover:bg-[#e6c675] disabled:opacity-60">
          {t('avisos.ativar')}
        </button>
      </div>
    </div>
  )
}

function Configuracoes({
  t,
  config,
  onConfig,
  onImportou,
  onPrivacidade,
  onPasseio,
}: {
  t: Traduzir
  config: ConfigXadrez
  onConfig: (m: Partial<ConfigXadrez>) => void
  onImportou: () => void
  onPrivacidade: () => void
  onPasseio: () => void
}) {
  const qualidades: { id: QualidadeXadrez; nome: string }[] = [
    { id: 'baixa', nome: t('config.qualidadeBaixa') },
    { id: 'media', nome: t('config.qualidadeMedia') },
    { id: 'alta', nome: t('config.qualidadeAlta') },
  ]
  return (
    <>
      <Linha titulo={t('config.qualidade')} dica={t(`config.qualidadeDica.${config.qualidade}`)}>
        <Opcoes rotulo={t('config.qualidade')} valor={config.qualidade} opcoes={qualidades} onMudar={(qualidade) => onConfig({ qualidade })} />
      </Linha>
      <Linha titulo={t('config.som')}>
        <Alternador rotulo={t('config.som')} ligado={config.som} onMudar={(som) => onConfig({ som })} />
      </Linha>
      <Linha titulo={t('config.volume')}>
        <Volume rotulo={t('config.volume')} valor={config.volume} minimo={0.05} desligado={!config.som} onMudar={(volume) => onConfig({ volume })} />
      </Linha>
      {/* cada categoria por cima do volume geral; no zero, aquela categoria fica muda */}
      <div data-volumes className="space-y-1.5 border-t border-[#c9a24a]/20 py-2.5 pl-3">
        {(
          [
            ['volumeEfeitos', 'config.volumeEfeitos'],
            ['volumePassos', 'config.volumePassos'],
            ['volumeAmbiente', 'config.volumeAmbiente'],
          ] as const
        ).map(([campo, chave]) => (
          <div key={campo} className="flex items-center justify-between gap-4">
            <p className="text-xs text-[#e9d7b0]">{t(chave)}</p>
            <Volume
              rotulo={t(chave)}
              valor={config[campo]}
              desligado={!config.som || (campo === 'volumeAmbiente' && !config.ambiente)}
              onMudar={(v) => onConfig({ [campo]: v } as Partial<ConfigXadrez>)}
            />
          </div>
        ))}
      </div>
      <Linha titulo={t('config.ambiente')}>
        <Alternador rotulo={t('config.ambiente')} ligado={config.ambiente} onMudar={(ambiente) => onConfig({ ambiente })} />
      </Linha>
      <AvisosComOJogoFechado t={t} idioma={config.idioma} />
      <Linha titulo={t('config.toque')} dica={t('config.toqueDica')}>
        <Alternador rotulo={t('config.toque')} ligado={config.toque} onMudar={(toque) => onConfig({ toque })} />
      </Linha>
      <Linha titulo={t('config.menosMovimento')} dica={t('config.menosMovimentoDica')}>
        <Alternador rotulo={t('config.menosMovimento')} ligado={config.menosMovimento} onMudar={(menosMovimento) => onConfig({ menosMovimento })} />
      </Linha>
      <Linha titulo={t('config.registro')} dica={t('config.registroDica')}>
        <Alternador rotulo={t('config.registro')} ligado={config.registro} onMudar={(registro) => onConfig({ registro })} />
      </Linha>
      <Linha titulo={t('config.tela')} dica={t('config.telaDica')}>
        <Opcoes
          rotulo={t('config.tela')}
          valor={config.telaMovel ? 'movel' : 'fixa'}
          opcoes={[
            { id: 'fixa', nome: t('config.telaEstatica') },
            { id: 'movel', nome: t('config.telaMovel') },
          ]}
          onMudar={(v) => onConfig({ telaMovel: v === 'movel' })}
        />
      </Linha>
      <Linha titulo={t('config.idioma')}>
        <Opcoes<Idioma> rotulo={t('config.idioma')} valor={config.idioma} opcoes={IDIOMAS} onMudar={(idioma) => onConfig({ idioma })} />
      </Linha>
      <Linha titulo={t('passeio.rever')}>
        <button type="button" className={botaoPequeno} onClick={onPasseio} data-rever-passeio>
          {t('passeio.ver')}
        </button>
      </Linha>
      <Linha titulo={t('privacidade.titulo')}>
        <button type="button" className={botaoPequeno} onClick={onPrivacidade} data-abrir-privacidade>
          {t('privacidade.ler')}
        </button>
      </Linha>
      {new URLSearchParams(location.search).has('importar') && <ImportarPartidas t={t} onImportou={onImportou} />}
    </>
  )
}

type Painel = 'inicio' | 'loja' | 'personalizacao' | 'conta' | 'amigos' | 'perfil' | 'privacidade'

const TITULOS: Record<Exclude<Painel, 'inicio'>, ChaveTexto> = {
  loja: 'menu.loja',
  personalizacao: 'menu.personalizacao',
  conta: 'conta.titulo',
  amigos: 'menu.amigos',
  perfil: 'menu.perfil',
  privacidade: 'privacidade.titulo',
}

export function MenuXadrez({
  t,
  config,
  onConfig,
  temPartida,
  partidasTerminadas,
  partidasContraMaquina,
  onContinuar,
  onNovoJogo,
  onAbrirSala,
  montarVitrine,
  montarExpositor,
  onImportou,
  escondido = false,
  onVerEmAcao,
  voltandoAoPerfil = false,
  onVerDoPerfil,
  onAbrirSalaDoPerfil,
}: {
  t: Traduzir
  config: ConfigXadrez
  onConfig: (m: Partial<ConfigXadrez>) => void
  /** Tem partida em andamento pra retomar. */
  temPartida: boolean
  partidasTerminadas: PartidaXadrez[]
  /** Todas as partidas contra a máquina, também as em andamento: é delas que saem as conquistas. */
  partidasContraMaquina: PartidaXadrez[]
  onContinuar: () => void
  onNovoJogo: () => void
  onAbrirSala: (codigo: string) => void
  /** A peça vestida, sozinha, pra vitrine da Personalização. */
  montarVitrine: (tipo: string, escolhas: Record<string, string>) => VitrineDaPeca | null
  /** O equipamento sozinho, pro expositor de cada quadrado da Personalização. */
  montarExpositor: (tipo: string, parte: string, opcao: string) => THREE.Object3D | null
  onImportou: () => void
  /** A prévia da Loja está passando no tabuleiro: o menu some, sem perder onde estava (a Loja reabre no item). */
  escondido?: boolean
  /** "Ver em ação": a prévia do item da Loja no tabuleiro. */
  onVerEmAcao: (item: string) => void
  /** De volta de uma partida aberta pelo Perfil: o menu abre no Perfil, como estava. */
  voltandoAoPerfil?: boolean
  /** A partida aberta pelo Perfil: o botão de cima dela vira "Voltar", que volta pra cá. */
  onVerDoPerfil: (partida: PartidaXadrez) => void
  onAbrirSalaDoPerfil: (codigo: string) => void
}) {
  const sessao = useSessao()
  const { amigos, atualizar: atualizarAmigos } = useAmigos()
  const novidades = (amigos?.convitesRecebidos.length ?? 0) + (amigos?.partidasRecebidas.length ?? 0)
  const [painel, setPainel] = useState<Painel>(voltandoAoPerfil ? 'perfil' : 'inicio')
  const aplicativo = useAplicativo()
  const podeInstalar = !aplicativo.instalado && (aplicativo.pedido !== null || aplicativo.noIphone)
  const [dicaDoIphone, setDicaDoIphone] = useState(false)
  const [conquistas, setConquistas] = useState<SituacaoDasConquistas | null>(null)
  const [conquistasNovas, setConquistasNovas] = useState<Conquista[]>([])
  // óticoins das vitórias contra a máquina que o servidor acabou de pagar, e as que chegaram sem vaga na hora
  const [premioDasVitorias, setPremioDasVitorias] = useState(0)
  const [vitoriasSemPremio, setVitoriasSemPremio] = useState(0)

  // ao abrir o menu, confere as conquistas e recebe as óticoins do que foi alcançado desde a última vez
  useEffect(() => {
    let cancelado = false
    verificarConquistas(partidasContraMaquina)
      .then((situacao) => {
        // o aviso vale mesmo se a lista de partidas mudou no meio: a conquista já foi paga e não volta a aparecer
        if (situacao.premioDasVitorias > 0) setPremioDasVitorias(situacao.premioDasVitorias)
        if (situacao.vitoriasSemPremio > 0) setVitoriasSemPremio(situacao.vitoriasSemPremio)
        if (situacao.novas.length > 0) {
          setConquistasNovas(situacao.novas)
          // conquista nova pode liberar equipamento na Personalização
          void carregarPersonalizacao()
        }
        if (!cancelado) setConquistas(situacao)
      })
      .catch(() => {
        // sem conexão: confere na próxima vez
      })
    return () => {
      cancelado = true
    }
  }, [partidasContraMaquina, sessao?.token])

  useEffect(() => {
    if (conquistasNovas.length === 0) return
    const prazo = window.setTimeout(() => setConquistasNovas([]), 7000)
    return () => window.clearTimeout(prazo)
  }, [conquistasNovas])
  useEffect(() => {
    if (premioDasVitorias === 0) return
    const prazo = window.setTimeout(() => setPremioDasVitorias(0), 7000)
    return () => window.clearTimeout(prazo)
  }, [premioDasVitorias])
  useEffect(() => {
    if (vitoriasSemPremio === 0) return
    const prazo = window.setTimeout(() => setVitoriasSemPremio(0), 9000)
    return () => window.clearTimeout(prazo)
  }, [vitoriasSemPremio])
  // pedidos de amizade: a tela inicial avisa cada um uma vez; tocar abre a aba Amigos, onde se confirma ou recusa
  const [avisados, setAvisados] = useState<{ usuario: string; ids: string[] } | null>(null)
  const idsAvisados = sessao ? (avisados?.usuario === sessao.usuario.id ? avisados.ids : pedidosAvisados(sessao.usuario.id)) : []
  const pedidoNovo = sessao && amigos ? amigos.convitesRecebidos.find((j) => !idsAvisados.includes(j.idJogador)) : undefined
  function marcarAvisados(ids: string[]) {
    if (!sessao || !amigos) return
    // fica só o que ainda está aberto, pra lista não crescer pra sempre
    const abertos = new Set(amigos.convitesRecebidos.map((j) => j.idJogador))
    const novos = [...new Set([...idsAvisados, ...ids])].filter((id) => abertos.has(id))
    guardarPedidosAvisados(sessao.usuario.id, novos)
    setAvisados({ usuario: sessao.usuario.id, ids: novos })
  }
  function abrirAmigos() {
    marcarAvisados(amigos?.convitesRecebidos.map((j) => j.idJogador) ?? [])
    setPainel('amigos')
  }
  // os avisos com o jogo fechado: a inscrição fica em dia a cada abertura (o navegador pode trocá-la, o idioma pode mudar)
  useEffect(() => {
    if (sessao) void manterAvisos(config.idioma)
  }, [sessao, config.idioma])
  // tocar no aviso de convite ou de pedido de amizade abre o jogo em ?amigos=1: vai direto pros Amigos
  useEffect(() => {
    const endereco = new URL(location.href)
    if (!endereco.searchParams.has('amigos')) return
    endereco.searchParams.delete('amigos')
    history.replaceState(history.state, '', endereco.href)
    if (sessao) setPainel('amigos')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura
  }, [])

  // o convite do link: o pedido que chegou entra na lista na hora (e vira o aviso de cima); o resto avisa aqui
  const avisoDoLink = useConviteDeAmizade().aviso
  useEffect(() => {
    if (avisoDoLink?.tipo === 'pedido' || avisoDoLink?.tipo === 'amigos') void atualizarAmigos()
    if (avisoDoLink?.tipo === 'pedido' || avisoDoLink?.tipo === 'semConexao') dispensarAvisoDoConvite()
  }, [avisoDoLink, atualizarAmigos])
  useEffect(() => {
    // quem ainda não entrou na conta precisa do aviso até entrar
    if (!avisoDoLink || avisoDoLink.tipo === 'semConta') return
    const prazo = window.setTimeout(dispensarAvisoDoConvite, 10000)
    return () => window.clearTimeout(prazo)
  }, [avisoDoLink])
  const textoDoLink =
    avisoDoLink?.tipo === 'semConta'
      ? t('convite.semConta', { nome: avisoDoLink.de.nome })
      : avisoDoLink?.tipo === 'amigos'
        ? t('convite.viraramAmigos', { nome: avisoDoLink.de.nome })
        : avisoDoLink?.tipo === 'jaAmigos'
          ? t('convite.jaAmigos')
          : avisoDoLink?.tipo === 'proprio'
            ? t('convite.proprio')
            : avisoDoLink?.tipo === 'invalido'
              ? t('convite.invalido')
              : null

  // o passeio da primeira vez: espera o menu aparecer, e quem já jogou não vê (pode rever nas Configurações)
  const [passeio, setPasseio] = useState(false)
  const jaJogou = temPartida || partidasTerminadas.length > 0 || partidasContraMaquina.length > 0
  useEffect(() => {
    if (passeioJaVisto() || !passeioNaAutomacao()) return
    const prazo = window.setTimeout(() => setPasseio(!passeioJaVisto()), 1200)
    return () => window.clearTimeout(prazo)
  }, [])
  useEffect(() => {
    if (jaJogou && !passeioJaVisto()) {
      marcarPasseioVisto()
      setPasseio(false)
    }
  }, [jaJogou])

  // o código de recuperação só aparece uma vez: nem Esc nem Voltar fecham essa tela sem querer
  const [mostrandoCodigo, setMostrandoCodigo] = useState(false)
  // a privacidade volta pra tela de onde foi aberta (o Perfil ou a conta)
  const [antesDaPrivacidade, setAntesDaPrivacidade] = useState<Painel>('inicio')
  const [perfilNasConfiguracoes, setPerfilNasConfiguracoes] = useState(false)
  function abrirPrivacidade() {
    setAntesDaPrivacidade(painel)
    setPerfilNasConfiguracoes(painel === 'perfil')
    setPainel('privacidade')
  }
  const voltar = () => setPainel(painel === 'privacidade' ? antesDaPrivacidade : 'inicio')
  useFecharComEsc(voltar, painel !== 'inicio' && !mostrandoCodigo)

  return (
    <div className={`absolute inset-0 z-10 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(10,6,3,0.72)_0%,rgba(10,6,3,0.28)_42%,rgba(10,6,3,0)_70%)] p-4 ${escondido ? 'hidden' : 'flex'}`}>
      {painel === 'inicio' && (
        // no celular em pé o tabuleiro fica de lado, numa faixa no meio: o título vai logo acima dele e os botões em grade
        // logo abaixo. Na tela muito baixa, o título vai pro canto pra não cobrir as peças
        <div className="mt-3 grid w-full max-w-[17rem] grid-cols-2 gap-1.5 max-sm:mb-14 max-sm:self-end sm:mt-0 sm:max-w-[15rem] sm:grid-cols-1 sm:gap-2.5 [@media(max-height:520px)]:!grid-cols-2 [@media(max-height:520px)]:!max-w-sm [@media(max-height:520px)]:!gap-1.5">
          <h2 className="absolute left-4 top-3 font-display text-xl font-bold tracking-wide text-[#f5e6c8] [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] max-sm:bottom-[calc(50%+22vw)] max-sm:left-1/2 max-sm:top-auto max-sm:-translate-x-1/2 max-sm:whitespace-nowrap max-sm:text-3xl sm:static sm:mb-1 sm:justify-self-center sm:whitespace-nowrap sm:text-center sm:text-4xl [@media(max-height:520px)]:!absolute [@media(max-height:520px)]:!bottom-auto [@media(max-height:520px)]:!left-4 [@media(max-height:520px)]:!top-3 [@media(max-height:520px)]:!translate-x-0 [@media(max-height:520px)]:!text-xl flex items-center justify-center gap-2">
            {/* a óticoin é a logo do jogo */}
            <img src={`${import.meta.env.BASE_URL}icones/icone-192.png`} alt="" aria-hidden className="h-[1.2em] w-[1.2em] shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" data-logo />
            {t('titulo')}
          </h2>
          {temPartida && (
            <button type="button" className={botaoMenu} onClick={onContinuar}>
              {t('menu.continuar')}
            </button>
          )}
          <button type="button" className={`${botaoMenu} ${temPartida ? '' : 'col-span-2 sm:col-span-1 [@media(max-height:520px)]:!col-span-2'}`} onClick={onNovoJogo} data-passeio="novoJogo">
            {t('menu.novoJogo')}
          </button>
          <button type="button" className={botaoMenu} onClick={abrirAmigos} data-passeio="amigos">
            {t('menu.amigos')} {novidades > 0 && <span className="ml-1 rounded-full bg-[#c9a24a] px-1.5 text-xs font-bold text-[#1c120a]">{novidades}</span>}
          </button>
          <button type="button" className={botaoMenu} onClick={() => {
              setPerfilNasConfiguracoes(false)
              setPainel('perfil')
            }} data-passeio="perfil">
            {t('menu.perfil')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('loja')} data-passeio="loja">
            {t('menu.loja')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('personalizacao')}>
            {t('menu.personalizacao')}
          </button>
        </div>
      )}

      {painel === 'inicio' && (conquistasNovas.length > 0 || premioDasVitorias > 0 || vitoriasSemPremio > 0 || pedidoNovo || textoDoLink) && (
        <div className="absolute left-1/2 top-14 z-20 flex w-max max-w-[90%] -translate-x-1/2 flex-col items-center gap-2">
          {premioDasVitorias > 0 && (
            <div role="status" className={`${avisoFlutuante} px-4 py-2`} data-aviso-vitoria>
              <Oticoin tamanho={34} girando />
              <span>{t('conquistas.vitoriasPagas', { n: premioDasVitorias })}</span>
            </div>
          )}
          {vitoriasSemPremio > 0 && (
            <div role="status" className={`${avisoFlutuante} px-4 py-2`} data-aviso-sem-premio>
              <span>{t(vitoriasSemPremio === 1 ? 'recompensa.semPremioUma' : 'recompensa.semPremioVarias', { n: vitoriasSemPremio, limite: RECOMPENSAS_POR_HORA })}</span>
            </div>
          )}
          {conquistasNovas.length > 0 && (
            <div role="status" className={`${avisoFlutuante} px-4 py-2`} data-aviso-conquista>
              <Oticoin tamanho={34} girando />
              <span>
                {t('conquistas.nova', { nome: nomeDaConquista(t, conquistasNovas[0]), n: conquistasNovas[0].oticoins })}
                {conquistasNovas.length > 1 ? ` ${t('conquistas.maisNovas', { n: conquistasNovas.length - 1 })}` : ''}
              </span>
            </div>
          )}
          {pedidoNovo && (
            <div role="status" className={avisoFlutuante} data-aviso-amizade={pedidoNovo.idJogador}>
              <button type="button" onClick={abrirAmigos} className="flex min-w-0 items-center gap-2 py-2 pl-3 text-left">
                <Avatar jogador={pedidoNovo} tamanho={30} />
                <span>{t('convite.pedido', { nome: pedidoNovo.nome })}</span>
              </button>
              <button type="button" aria-label={t('convite.fechar')} onClick={() => marcarAvisados([pedidoNovo.idJogador])} className="self-stretch px-3 text-[#c9b48a] hover:text-[#f5e6c8]">
                ✕
              </button>
            </div>
          )}
          {textoDoLink && (
            <div role="status" className={avisoFlutuante} data-aviso-link={avisoDoLink?.tipo}>
              {avisoDoLink?.tipo === 'semConta' || avisoDoLink?.tipo === 'amigos' ? (
                <button
                  type="button"
                  onClick={() => {
                    dispensarAvisoDoConvite()
                    abrirAmigos()
                  }}
                  className="flex min-w-0 items-center gap-2 py-2 pl-3 text-left"
                >
                  <Avatar jogador={avisoDoLink.de} tamanho={30} />
                  <span>{textoDoLink}</span>
                </button>
              ) : (
                <span className="py-2 pl-4">{textoDoLink}</span>
              )}
              <button type="button" aria-label={t('convite.fechar')} onClick={dispensarAvisoDoConvite} className="self-stretch px-3 text-[#c9b48a] hover:text-[#f5e6c8]">
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {painel === 'inicio' && (
        <button
          type="button"
          onClick={() => setPainel('conta')}
          className="absolute bottom-3 left-3 z-10 max-w-[48%] truncate rounded-lg border border-[#c9a24a]/60 bg-[#1c120a]/80 px-3 py-1.5 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614]"
        >
          {sessao ? sessao.usuario.nome : t('menu.entrar')}
        </button>
      )}

      {painel === 'inicio' && (podeInstalar || aplicativo.versaoNova) && (
        <div className="absolute bottom-3 right-3 z-10 flex max-w-[48%] flex-col items-end gap-1.5">
          {dicaDoIphone && (
            <p role="status" className="rounded-lg border border-[#c9a24a]/60 bg-[#1c120a]/95 px-3 py-2 text-[0.7rem] leading-snug text-[#f5e6c8] shadow-xl">
              {t('app.dicaIphone')}
            </p>
          )}
          {aplicativo.versaoNova && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="max-w-full truncate rounded-lg border border-[#e6c675] bg-[#c9a24a] px-3 py-1.5 text-xs font-semibold text-[#1c120a] transition hover:bg-[#e6c675]"
              data-versao-nova
            >
              ↻ {t('app.atualizar')}
            </button>
          )}
          {podeInstalar && (
            <button
              type="button"
              onClick={() => (aplicativo.pedido ? void instalarAplicativo() : setDicaDoIphone((aberta) => !aberta))}
              className="max-w-full truncate rounded-lg border border-[#c9a24a]/60 bg-[#1c120a]/80 px-3 py-1.5 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614]"
              data-instalar
            >
              ⬇ {t('app.instalar')}
            </button>
          )}
        </div>
      )}

      {painel === 'inicio' && passeio && <PasseioInicial t={t} onFim={() => setPasseio(false)} />}
      {/* depois de entrar na conta: ativar os avisos? (uma vez só; não por cima do passeio) */}
      {painel === 'inicio' && !passeio && !mostrandoCodigo && <PerguntaDosAvisos t={t} idioma={config.idioma} />}

      {painel !== 'inicio' && (
        <section role="dialog" aria-label={t(TITULOS[painel])} className={painelMenu}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold">{t(TITULOS[painel])}</h3>
            {!mostrandoCodigo && (
              <button type="button" onClick={voltar} className={botaoPequeno}>
                {t('menu.voltar')}
              </button>
            )}
          </div>
          {painel === 'loja' && (
            <PainelLoja
              t={t}
              saldo={conquistas?.oticoins ?? null}
              onSaldo={(oticoins) => setConquistas((atual) => atual && { ...atual, oticoins })}
              montarExpositor={montarExpositor}
              situacao={conquistas}
              onVerEmAcao={onVerEmAcao}
            />
          )}
          {painel === 'personalizacao' && <PainelPersonalizacao t={t} montarVitrine={montarVitrine} montarExpositor={montarExpositor} />}
          {painel === 'conta' && <PainelConta t={t} onConcluir={() => setPainel('inicio')} onCodigoNaTela={setMostrandoCodigo} privacidade={<PainelPrivacidade idioma={config.idioma} />} />}
          {painel === 'privacidade' && <PainelPrivacidade idioma={config.idioma} />}
          {painel === 'perfil' && (
            <PainelPerfil
              t={t}
              idioma={config.idioma}
              partidas={partidasTerminadas}
              onVerPartida={onVerDoPerfil}
              onAbrirSala={onAbrirSalaDoPerfil}
              voltandoDaPartida={voltandoAoPerfil}
              onEntrar={() => setPainel('conta')}
              conquistas={conquistas}
              abaInicial={perfilNasConfiguracoes ? 'configuracoes' : 'perfil'}
            >
              <Configuracoes t={t} config={config} onConfig={onConfig} onImportou={onImportou} onPrivacidade={abrirPrivacidade} onPasseio={() => {
                setPainel('inicio')
                setPasseio(true)
              }} />
            </PainelPerfil>
          )}
          {painel === 'amigos' && <PainelAmigos t={t} idioma={config.idioma} amigos={amigos} onAtualizar={atualizarAmigos} onAbrirSala={onAbrirSala} onCodigoNaTela={setMostrandoCodigo} />}
        </section>
      )}
    </div>
  )
}
