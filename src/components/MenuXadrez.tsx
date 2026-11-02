import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { ConfigXadrez, QualidadeXadrez } from '../chess/configXadrez'
import { IDIOMAS, type ChaveTexto, type Idioma, type Traduzir } from '../chess/idiomas'
import { useResumoDaNuvem } from '../db/db'
import { useAmigos, useSessao } from '../db/servidor'
import { importarPartidas, type PartidaXadrez } from '../db/xadrezRepo'
import { useFecharComEsc } from '../teclaEsc'
import { PainelAmigos } from './PainelAmigos'
import { PainelConta } from './PainelConta'
import { PainelPerfil } from './PainelPerfil'
import { PainelPersonalizacao } from './PainelPersonalizacao'
import { nomeDaConquista } from './PainelConquistas'
import { Oticoin } from './ElementosDoJogador'
import { verificarConquistas, type Conquista, type SituacaoDasConquistas } from '../chess/conquistas'
import { carregarPersonalizacao } from '../conta/personalizacao'
import { PainelLoja } from './PainelLoja'
import type { VitrineDaPeca } from '../chess/equipamentos'
import type * as THREE from 'three'

// -----------------------------------------------------------------------
// Tela inicial do jogo: fica por cima do próprio tabuleiro 3D, visto de lado
// (brancas de um lado, pretas do outro). As cores são fixas, de madeira e ouro:
// o fundo é sempre o tabuleiro, então não muda com o tema claro/escuro do site.
// -----------------------------------------------------------------------

const botaoMenu =
  'w-full rounded-xl border border-[#c9a24a]/70 bg-[#1c120a]/90 px-2 py-1.5 font-display text-sm font-semibold text-[#f5e6c8] shadow-lg transition hover:bg-[#3a2614] hover:border-[#e6c675] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c675] sm:px-5 sm:py-2.5 sm:text-base'
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

function Configuracoes({ t, config, onConfig, onImportou }: { t: Traduzir; config: ConfigXadrez; onConfig: (m: Partial<ConfigXadrez>) => void; onImportou: () => void }) {
  const qualidades: { id: QualidadeXadrez; nome: string }[] = [
    { id: 'baixa', nome: t('config.qualidadeBaixa') },
    { id: 'media', nome: t('config.qualidadeMedia') },
    { id: 'alta', nome: t('config.qualidadeAlta') },
  ]
  return (
    <>
      <Linha titulo={t('config.qualidade')}>
        <Opcoes rotulo={t('config.qualidade')} valor={config.qualidade} opcoes={qualidades} onMudar={(qualidade) => onConfig({ qualidade })} />
      </Linha>
      <Linha titulo={t('config.som')}>
        <Alternador rotulo={t('config.som')} ligado={config.som} onMudar={(som) => onConfig({ som })} />
      </Linha>
      <Linha titulo={t('config.volume')}>
        <input
          type="range"
          aria-label={t('config.volume')}
          min={0.05}
          max={1}
          step={0.05}
          value={config.volume}
          disabled={!config.som}
          onChange={(e) => onConfig({ volume: Number(e.target.value) })}
          className="w-32 accent-[#c9a24a] disabled:opacity-40"
        />
      </Linha>
      <Linha titulo={t('config.ambiente')}>
        <Alternador rotulo={t('config.ambiente')} ligado={config.ambiente} onMudar={(ambiente) => onConfig({ ambiente })} />
      </Linha>
      <Linha titulo={t('config.toque')} dica={t('config.toqueDica')}>
        <Alternador rotulo={t('config.toque')} ligado={config.toque} onMudar={(toque) => onConfig({ toque })} />
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
      {new URLSearchParams(location.search).has('importar') && <ImportarPartidas t={t} onImportou={onImportou} />}
    </>
  )
}

type Painel = 'inicio' | 'loja' | 'personalizacao' | 'conta' | 'amigos' | 'perfil'

const TITULOS: Record<Exclude<Painel, 'inicio'>, ChaveTexto> = {
  loja: 'menu.loja',
  personalizacao: 'menu.personalizacao',
  conta: 'conta.titulo',
  amigos: 'menu.amigos',
  perfil: 'menu.perfil',
}

export function MenuXadrez({
  t,
  config,
  onConfig,
  temPartida,
  partidasTerminadas,
  partidasContraMaquina,
  onVerPartida,
  onContinuar,
  onNovoJogo,
  telaCheia,
  onExpandir,
  onTelaNormal,
  onAbrirSala,
  montarVitrine,
  montarExpositor,
  onImportou,
}: {
  t: Traduzir
  config: ConfigXadrez
  onConfig: (m: Partial<ConfigXadrez>) => void
  /** Tem partida em andamento pra retomar. */
  temPartida: boolean
  partidasTerminadas: PartidaXadrez[]
  /** Todas as partidas contra a máquina, também as em andamento: é delas que saem as conquistas. */
  partidasContraMaquina: PartidaXadrez[]
  onVerPartida: (partida: PartidaXadrez) => void
  onContinuar: () => void
  onNovoJogo: () => void
  telaCheia: boolean
  onExpandir: () => void
  onTelaNormal: () => void
  onAbrirSala: (codigo: string) => void
  /** A peça vestida, sozinha, pra vitrine da Personalização. */
  montarVitrine: (tipo: string, escolhas: Record<string, string>) => VitrineDaPeca | null
  /** O equipamento sozinho, pro expositor de cada quadrado da Personalização. */
  montarExpositor: (tipo: string, parte: string, opcao: string) => THREE.Object3D | null
  onImportou: () => void
}) {
  const sessao = useSessao()
  const { amigos, atualizar: atualizarAmigos } = useAmigos()
  const novidades = (amigos?.convitesRecebidos.length ?? 0) + (amigos?.partidasRecebidas.length ?? 0)
  const [painel, setPainel] = useState<Painel>('inicio')
  const [conquistas, setConquistas] = useState<SituacaoDasConquistas | null>(null)
  const [conquistasNovas, setConquistasNovas] = useState<Conquista[]>([])

  // ao abrir o menu, confere as conquistas e recebe as óticoins do que foi alcançado desde a última vez
  useEffect(() => {
    let cancelado = false
    verificarConquistas(partidasContraMaquina)
      .then((situacao) => {
        // o aviso vale mesmo se a lista de partidas mudou no meio: a conquista já foi paga e não volta a aparecer
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
  // o código de recuperação só aparece uma vez: nem Esc nem Voltar fecham essa tela sem querer
  const [mostrandoCodigo, setMostrandoCodigo] = useState(false)
  useFecharComEsc(() => setPainel('inicio'), painel !== 'inicio' && !mostrandoCodigo)

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(10,6,3,0.72)_0%,rgba(10,6,3,0.28)_42%,rgba(10,6,3,0)_70%)] p-4">
      <button
        type="button"
        onClick={telaCheia ? onTelaNormal : onExpandir}
        className="absolute right-3 top-3 z-10 rounded-lg border border-[#c9a24a]/60 bg-[#1c120a]/80 px-3 py-1.5 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614]"
      >
        {telaCheia ? `✕ ${t('menu.telaNormal')}` : `⛶ ${t('menu.expandir')}`}
      </button>

      {painel === 'inicio' && (
        // no celular em pé o tabuleiro fica de lado, numa faixa no meio: o título vai logo acima dele e os botões em grade
        // logo abaixo. Na tela muito baixa, o título vai pro canto pra não cobrir as peças
        <div className="mt-3 grid w-full max-w-[17rem] grid-cols-2 gap-1.5 max-sm:mb-14 max-sm:self-end sm:mt-0 sm:max-w-[15rem] sm:grid-cols-1 sm:gap-2.5 [@media(max-height:520px)]:!grid-cols-2 [@media(max-height:520px)]:!max-w-sm [@media(max-height:520px)]:!gap-1.5">
          <h2 className="absolute left-4 top-3 font-display text-xl font-bold tracking-wide text-[#f5e6c8] [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] max-sm:bottom-[calc(50%+22vw)] max-sm:left-1/2 max-sm:top-auto max-sm:-translate-x-1/2 max-sm:whitespace-nowrap max-sm:text-3xl sm:static sm:mb-1 sm:justify-self-center sm:whitespace-nowrap sm:text-center sm:text-4xl [@media(max-height:520px)]:!absolute [@media(max-height:520px)]:!bottom-auto [@media(max-height:520px)]:!left-4 [@media(max-height:520px)]:!top-3 [@media(max-height:520px)]:!translate-x-0 [@media(max-height:520px)]:!text-xl">{t('titulo')}</h2>
          {temPartida && (
            <button type="button" className={botaoMenu} onClick={onContinuar}>
              {t('menu.continuar')}
            </button>
          )}
          <button type="button" className={`${botaoMenu} ${temPartida ? '' : 'col-span-2 sm:col-span-1 [@media(max-height:520px)]:!col-span-2'}`} onClick={onNovoJogo}>
            {t('menu.novoJogo')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('amigos')}>
            {t('menu.amigos')} {novidades > 0 && <span className="ml-1 rounded-full bg-[#c9a24a] px-1.5 text-xs font-bold text-[#1c120a]">{novidades}</span>}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('perfil')}>
            {t('menu.perfil')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('loja')}>
            {t('menu.loja')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('personalizacao')}>
            {t('menu.personalizacao')}
          </button>
        </div>
      )}

      {painel === 'inicio' && conquistasNovas.length > 0 && (
        <div
          role="status"
          className="absolute left-1/2 top-14 z-20 flex w-max max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-xl border border-[#e6c675] bg-[#1c120a]/95 px-4 py-2 text-sm font-semibold text-[#f5e6c8] shadow-xl"
          data-aviso-conquista
        >
          <Oticoin tamanho={34} girando />
          <span>
            {t('conquistas.nova', { nome: nomeDaConquista(t, conquistasNovas[0]), n: conquistasNovas[0].oticoins })}
            {conquistasNovas.length > 1 ? ` ${t('conquistas.maisNovas', { n: conquistasNovas.length - 1 })}` : ''}
          </span>
        </div>
      )}

      {painel === 'inicio' && (
        <button
          type="button"
          onClick={() => setPainel('conta')}
          className="absolute bottom-3 left-3 z-10 max-w-[60%] truncate rounded-lg border border-[#c9a24a]/60 bg-[#1c120a]/80 px-3 py-1.5 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614]"
        >
          {sessao ? sessao.usuario.nome : t('menu.entrar')}
        </button>
      )}

      {painel !== 'inicio' && (
        <section role="dialog" aria-label={t(TITULOS[painel])} className={painelMenu}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold">{t(TITULOS[painel])}</h3>
            {!mostrandoCodigo && (
              <button type="button" onClick={() => setPainel('inicio')} className="rounded-lg border border-[#c9a24a]/50 px-3 py-1 text-xs font-semibold hover:bg-[#3a2614]">
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
            />
          )}
          {painel === 'personalizacao' && <PainelPersonalizacao t={t} montarVitrine={montarVitrine} montarExpositor={montarExpositor} />}
          {painel === 'conta' && <PainelConta t={t} onConcluir={() => setPainel('inicio')} onCodigoNaTela={setMostrandoCodigo} />}
          {painel === 'perfil' && (
            <PainelPerfil
              t={t}
              idioma={config.idioma}
              partidas={partidasTerminadas}
              comHistorico={config.registro}
              onVerPartida={onVerPartida}
              onAbrirSala={onAbrirSala}
              onEntrar={() => setPainel('conta')}
              conquistas={conquistas}
            >
              <Configuracoes t={t} config={config} onConfig={onConfig} onImportou={onImportou} />
            </PainelPerfil>
          )}
          {painel === 'amigos' && <PainelAmigos t={t} idioma={config.idioma} amigos={amigos} onAtualizar={atualizarAmigos} onAbrirSala={onAbrirSala} onCodigoNaTela={setMostrandoCodigo} />}
        </section>
      )}
    </div>
  )
}
