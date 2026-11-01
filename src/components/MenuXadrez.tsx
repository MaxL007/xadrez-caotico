import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { ConfigXadrez, QualidadeXadrez } from '../chess/configXadrez'
import { IDIOMAS, type ChaveTexto, type Idioma, type Traduzir } from '../chess/idiomas'
import { useResumoDaNuvem } from '../db/db'
import { useSessao } from '../db/servidor'
import { importarPartidas } from '../db/xadrezRepo'
import { useFecharComEsc } from '../teclaEsc'
import { PainelConta } from './PainelConta'
import { PainelOnline } from './PainelOnline'

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

type Painel = 'inicio' | 'loja' | 'config' | 'conta' | 'online'

const TITULOS: Record<Exclude<Painel, 'inicio'>, ChaveTexto> = {
  loja: 'menu.loja',
  config: 'menu.configuracoes',
  conta: 'conta.titulo',
  online: 'menu.online',
}

export function MenuXadrez({
  t,
  config,
  onConfig,
  temPartida,
  onContinuar,
  onNovoJogo,
  telaCheia,
  onExpandir,
  onTelaNormal,
  codigoDoConvite,
  onAbrirSala,
  onImportou,
}: {
  t: Traduzir
  config: ConfigXadrez
  onConfig: (m: Partial<ConfigXadrez>) => void
  /** Tem partida em andamento pra retomar. */
  temPartida: boolean
  onContinuar: () => void
  onNovoJogo: () => void
  telaCheia: boolean
  onExpandir: () => void
  onTelaNormal: () => void
  /** Veio por um link de convite: a tela já abre na partida contra outra pessoa. */
  codigoDoConvite: string | null
  onAbrirSala: (codigo: string) => void
  onImportou: () => void
}) {
  const sessao = useSessao()
  const [painel, setPainel] = useState<Painel>(codigoDoConvite ? 'online' : 'inicio')
  // o código de recuperação só aparece uma vez: nem Esc nem Voltar fecham essa tela sem querer
  const [mostrandoCodigo, setMostrandoCodigo] = useState(false)
  useFecharComEsc(() => setPainel('inicio'), painel !== 'inicio' && !mostrandoCodigo)

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(10,6,3,0.72)_0%,rgba(10,6,3,0.28)_42%,rgba(10,6,3,0)_70%)] p-4">
      <button
        type="button"
        onClick={telaCheia ? onTelaNormal : onExpandir}
        className="absolute right-3 top-3 z-10 rounded-lg border border-[#c9a24a]/60 bg-[#1c120a]/80 px-3 py-1.5 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614]"
      >
        {telaCheia ? `✕ ${t('menu.telaNormal')}` : `⛶ ${t('menu.expandir')}`}
      </button>

      {painel === 'inicio' && (
        // tela em pé: os botões em grade, no meio do tabuleiro, e o título em cima, pra não cobrir as peças
        <div className="mt-3 grid w-full max-w-[17rem] grid-cols-2 gap-1.5 sm:mt-0 sm:max-w-[15rem] sm:grid-cols-1 sm:gap-2.5">
          <h2 className="absolute left-4 top-3 font-display text-xl font-bold tracking-wide text-[#f5e6c8] [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] sm:static sm:mb-1 sm:justify-self-center sm:whitespace-nowrap sm:text-center sm:text-4xl">{t('titulo')}</h2>
          {temPartida && (
            <button type="button" className={botaoMenu} onClick={onContinuar}>
              {t('menu.continuar')}
            </button>
          )}
          <button type="button" className={`${botaoMenu} ${temPartida ? '' : 'col-span-2 sm:col-span-1'}`} onClick={onNovoJogo}>
            {t('menu.novoJogo')}
          </button>
          <button type="button" className={`${botaoMenu} col-span-2 sm:col-span-1`} onClick={() => setPainel('online')}>
            {t('menu.online')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('loja')}>
            {t('menu.loja')}
          </button>
          <button type="button" className={botaoMenu} onClick={() => setPainel('config')}>
            {t('menu.configuracoes')}
          </button>
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
          {painel === 'loja' && <p className="py-6 text-center text-sm text-[#c9b48a]">{t('loja.vazia')}</p>}
          {painel === 'config' && <Configuracoes t={t} config={config} onConfig={onConfig} onImportou={onImportou} />}
          {painel === 'conta' && <PainelConta t={t} onConcluir={() => setPainel('inicio')} onCodigoNaTela={setMostrandoCodigo} />}
          {painel === 'online' && <PainelOnline t={t} codigoDoConvite={codigoDoConvite} onAbrirSala={onAbrirSala} onCodigoNaTela={setMostrandoCodigo} />}
        </section>
      )}
    </div>
  )
}
