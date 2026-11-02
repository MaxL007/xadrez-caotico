import { useEffect, useState, type FormEvent } from 'react'
import type { ChaveTexto, Idioma, Traduzir } from '../chess/idiomas'
import { convidarAmigo, criarSala, entrarEmSala, ErroDoServidor, listarSalas, recusarSala, removerAmigo, useSessao, verPerfil, type Amigos, type Jogador, type Perfil, type SalaNaLista } from '../db/servidor'
import { PainelConta } from './PainelConta'

// Amigos: o ID de quem joga, os convites, a lista de amigos e as partidas amistosas com eles.

const botaoCor = 'rounded-lg border border-[#c9a24a]/40 px-3 py-2 text-sm font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614] disabled:opacity-50'
const botaoPequeno = 'rounded-lg border border-[#c9a24a]/40 px-2 py-1 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614] disabled:opacity-50'
const botaoLink = 'text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline disabled:opacity-50'
const secao = 'space-y-1 border-t border-[#c9a24a]/20 pt-3'

const mensagemDeErro = (erro: unknown): ChaveTexto => {
  const codigo = erro instanceof ErroDoServidor ? erro.message : ''
  if (codigo === 'jogador-nao-encontrado') return 'amigos.erroNaoEncontrado'
  if (codigo === 'voce-mesmo') return 'amigos.erroVoceMesmo'
  if (codigo === 'ja-amigos') return 'amigos.erroJaAmigos'
  if (codigo === 'muitos-amigos') return 'amigos.erroMuitosAmigos'
  if (codigo === 'nao-e-amigo') return 'amigos.erroNaoEAmigo'
  if (codigo === 'sala-encerrada') return 'amigos.erroPartidaVencida'
  if (codigo === 'muitos-convites') return 'online.erroMuitosConvites'
  if (codigo === 'muitas-tentativas') return 'conta.erroTentativas'
  return 'conta.erroConexao'
}

function rotuloDoResultado(t: Traduzir, sala: SalaNaLista): string {
  if (sala.status === 'aguardando') return t('online.listaAguardando')
  if (sala.status === 'andamento') return t('online.listaAndamento')
  if (sala.status === 'expirada') return t('online.listaExpirada')
  if (sala.resultado === 'empate') return t('online.listaEmpate')
  return t((sala.resultado === 'brancas') === (sala.minhaCor === 'w') ? 'online.listaVenceu' : 'online.listaPerdeu')
}

function MeuId({ t, id }: { t: Traduzir; id: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#2a1c10] px-3 py-2">
      <p className="text-xs text-[#c9b48a]">
        {t('amigos.meuId')}{' '}
        <span className="select-all font-mono text-sm font-semibold tracking-widest text-[#f5e6c8]" data-meu-id>
          {id}
        </span>
      </p>
      <button
        type="button"
        className={botaoLink}
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(() => setCopiado(true))
        }}
      >
        {t(copiado ? 'conta.copiado' : 'conta.copiar')}
      </button>
    </div>
  )
}

function ConvidarAmigos({ t, onConvidou }: { t: Traduzir; onConvidou: () => Promise<void> }) {
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    setAviso('')
    try {
      const { nome, status } = await convidarAmigo(busca.trim())
      setAviso(t(status === 'aceita' ? 'amigos.aceitou' : 'amigos.convidou', { nome }))
      setBusca('')
      await onConvidou()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="space-y-2" onSubmit={enviar}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('amigos.convidarTitulo')}</span>
        <input
          className="w-full rounded-lg border border-[#c9a24a]/40 bg-[#2a1c10] px-3 py-2 text-sm text-[#f5e6c8] outline-none placeholder:text-[#8f7a58] focus:border-[#e6c675]"
          placeholder={t('amigos.convidarCampo')}
          maxLength={40}
          autoComplete="off"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      <button type="submit" className={`${botaoCor} w-full`} disabled={enviando || !busca.trim()}>
        {t('amigos.convidar')}
      </button>
      {aviso && (
        <p role="status" className="text-xs font-medium text-[#c9b48a]">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}
    </form>
  )
}

function Quadro({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-[#2a1c10] px-1 py-2 text-center">
      <p className="text-lg font-semibold">{valor}</p>
      <p className="text-[0.65rem] text-[#c9b48a]">{rotulo}</p>
    </div>
  )
}

function PerfilDoAmigo({
  t,
  idioma,
  amigo,
  enviando,
  onVoltar,
  onPartida,
  onRemover,
}: {
  t: Traduzir
  idioma: Idioma
  amigo: Jogador
  enviando: boolean
  onVoltar: () => void
  onPartida: () => void
  onRemover: () => void
}) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    let cancelado = false
    verPerfil(amigo.idJogador)
      .then((p) => {
        if (!cancelado) setPerfil(p)
      })
      .catch(() => {
        if (!cancelado) setFalhou(true)
      })
    return () => {
      cancelado = true
    }
  }, [amigo.idJogador])

  return (
    <div className="space-y-3" data-perfil>
      <button type="button" className={botaoLink} onClick={onVoltar}>
        {t('amigos.voltarLista')}
      </button>
      <div>
        <p className="truncate font-display text-lg font-semibold">{amigo.nome}</p>
        <p className="font-mono text-xs text-[#c9b48a]">{t('amigos.perfilId', { id: amigo.idJogador })}</p>
        {perfil && <p className="text-xs text-[#c9b48a]">{t('amigos.perfilDesde', { data: new Date(perfil.desde).toLocaleDateString(idioma) })}</p>}
      </div>
      {falhou && <p className="text-xs font-medium text-[#ffb4a8]">{t('conta.erroConexao')}</p>}
      {perfil && (
        <>
          <div>
            <p className="mb-1 text-sm font-medium">{t('amigos.perfilAmistosas')}</p>
            <div className="grid grid-cols-4 gap-2">
              <Quadro rotulo={t('amigos.perfilPartidas')} valor={perfil.geral.partidas} />
              <Quadro rotulo={t('amigos.perfilVitorias')} valor={perfil.geral.vitorias} />
              <Quadro rotulo={t('amigos.perfilDerrotas')} valor={perfil.geral.derrotas} />
              <Quadro rotulo={t('amigos.perfilEmpates')} valor={perfil.geral.empates} />
            </div>
          </div>
          <p className="text-xs text-[#c9b48a]">
            {t('amigos.perfilEntreVoces', { minhas: perfil.entreVoces.derrotas, nome: amigo.nome, deles: perfil.entreVoces.vitorias, empates: perfil.entreVoces.empates })}
          </p>
        </>
      )}
      <button type="button" className={`${botaoCor} w-full`} disabled={enviando} onClick={onPartida}>
        {t('amigos.partidaAmistosa')}
      </button>
      <button type="button" className={botaoLink} disabled={enviando} onClick={() => (confirmando ? onRemover() : setConfirmando(true))}>
        {t(confirmando ? 'amigos.removerConfirmar' : 'amigos.remover')}
      </button>
    </div>
  )
}

export function PainelAmigos({
  t,
  idioma,
  amigos,
  onAtualizar,
  onAbrirSala,
  onCodigoNaTela,
}: {
  t: Traduzir
  idioma: Idioma
  amigos: Amigos | null
  onAtualizar: () => Promise<void>
  onAbrirSala: (codigo: string) => void
  onCodigoNaTela: (naTela: boolean) => void
}) {
  const sessao = useSessao()
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [salas, setSalas] = useState<SalaNaLista[]>([])
  const [perfilDe, setPerfilDe] = useState<Jogador | null>(null)
  const [escolhendoCorPara, setEscolhendoCorPara] = useState<string | null>(null)
  // quem cria a conta aqui precisa ver o código de recuperação antes de seguir
  const [naTelaDaConta, setNaTelaDaConta] = useState(!sessao)
  const logado = !!sessao && !naTelaDaConta

  useEffect(() => {
    if (!logado) return
    let cancelado = false
    listarSalas()
      .then((r) => {
        if (!cancelado) setSalas(r.salas)
      })
      .catch(() => {
        // sem conexão: o painel abre só com os amigos
      })
    return () => {
      cancelado = true
    }
  }, [logado])

  async function abrirPartida(acao: () => Promise<{ codigo: string }>) {
    setEnviando(true)
    setErro(null)
    try {
      onAbrirSala((await acao()).codigo)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
      setEnviando(false)
      void onAtualizar()
    }
  }

  async function mudar(acao: () => Promise<unknown>) {
    setEnviando(true)
    setErro(null)
    try {
      await acao()
      await onAtualizar()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  if (!logado) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{t('amigos.precisaConta')}</p>
        <PainelConta t={t} onConcluir={() => setNaTelaDaConta(false)} onCodigoNaTela={onCodigoNaTela} />
      </div>
    )
  }

  const avisoDeErro = erro && (
    <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
      {t(erro)}
    </p>
  )

  if (perfilDe) {
    return (
      <>
        <PerfilDoAmigo
          t={t}
          idioma={idioma}
          amigo={perfilDe}
          enviando={enviando}
          onVoltar={() => setPerfilDe(null)}
          onPartida={() => {
            setPerfilDe(null)
            setEscolhendoCorPara(perfilDe.idJogador)
          }}
          onRemover={() => {
            void mudar(() => removerAmigo(perfilDe.idJogador)).then(() => setPerfilDe(null))
          }}
        />
        {avisoDeErro}
      </>
    )
  }

  const abertas = salas.filter((s) => s.status === 'andamento' || s.status === 'aguardando')
  const encerradas = salas.filter((s) => s.status === 'fim').slice(0, 5)

  return (
    <div className="space-y-4">
      {amigos && <MeuId t={t} id={amigos.meuId} />}
      <ConvidarAmigos t={t} onConvidou={onAtualizar} />
      {avisoDeErro}

      {!!amigos?.partidasRecebidas.length && (
        <div className={secao}>
          <p className="mb-1 text-sm font-medium">{t('amigos.partidasRecebidas')}</p>
          {amigos.partidasRecebidas.map((p) => (
            <div key={p.codigo} className="flex items-center justify-between gap-2 py-1">
              <p className="min-w-0 truncate text-sm">{t('amigos.chamou', { nome: p.nome })}</p>
              <span className="flex shrink-0 gap-1.5">
                <button type="button" className={botaoPequeno} disabled={enviando} onClick={() => void abrirPartida(() => entrarEmSala(p.codigo))}>
                  {t('amigos.jogar')}
                </button>
                <button type="button" className={botaoPequeno} disabled={enviando} onClick={() => void mudar(() => recusarSala(p.codigo))}>
                  {t('amigos.recusar')}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!!amigos?.convitesRecebidos.length && (
        <div className={secao}>
          <p className="mb-1 text-sm font-medium">{t('amigos.convitesRecebidos')}</p>
          {amigos.convitesRecebidos.map((j) => (
            <div key={j.idJogador} className="flex items-center justify-between gap-2 py-1">
              <p className="min-w-0 truncate text-sm">{j.nome}</p>
              <span className="flex shrink-0 gap-1.5">
                <button type="button" className={botaoPequeno} disabled={enviando} onClick={() => void mudar(() => convidarAmigo(j.idJogador))}>
                  {t('amigos.aceitar')}
                </button>
                <button type="button" className={botaoPequeno} disabled={enviando} onClick={() => void mudar(() => removerAmigo(j.idJogador))}>
                  {t('amigos.recusar')}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={secao}>
        <p className="mb-1 text-sm font-medium">{t('amigos.lista')}</p>
        {amigos?.amigos.length === 0 && <p className="text-xs text-[#c9b48a]">{t('amigos.vazio')}</p>}
        {amigos?.amigos.map((amigo) => (
          <div key={amigo.idJogador} className="space-y-1.5 py-1" data-amigo={amigo.idJogador}>
            <p className="truncate text-sm font-semibold">{amigo.nome}</p>
            {escolhendoCorPara === amigo.idJogador ? (
              <>
                <p className="text-xs text-[#c9b48a]">{t('amigos.voceJogaDe')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['w', 'b', 'sorteio'] as const).map((cor) => (
                    <button key={cor} type="button" className={botaoCor} disabled={enviando} onClick={() => void abrirPartida(() => criarSala(cor, amigo.idJogador))}>
                      {t(cor === 'w' ? 'cor.brancas' : cor === 'b' ? 'cor.pretas' : 'online.sorteio')}
                    </button>
                  ))}
                </div>
                <button type="button" className={botaoLink} onClick={() => setEscolhendoCorPara(null)}>
                  {t('amigos.cancelar')}
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={botaoPequeno} onClick={() => setEscolhendoCorPara(amigo.idJogador)}>
                  {t('amigos.partidaAmistosa')}
                </button>
                <button type="button" className={botaoPequeno} onClick={() => setPerfilDe(amigo)}>
                  {t('amigos.verPerfil')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!!amigos?.convitesEnviados.length && (
        <div className={secao}>
          <p className="mb-1 text-sm font-medium">{t('amigos.convitesEnviados')}</p>
          {amigos.convitesEnviados.map((j) => (
            <div key={j.idJogador} className="flex items-center justify-between gap-2 py-1">
              <p className="min-w-0 truncate text-sm">{j.nome}</p>
              <button type="button" className={botaoPequeno} disabled={enviando} onClick={() => void mudar(() => removerAmigo(j.idJogador))}>
                {t('amigos.cancelar')}
              </button>
            </div>
          ))}
        </div>
      )}

      {(abertas.length > 0 || encerradas.length > 0) && (
        <div className={secao}>
          <p className="mb-1 text-sm font-medium">{t('online.minhas')}</p>
          {[...abertas, ...encerradas].map((s) => (
            <button
              key={s.codigo}
              type="button"
              onClick={() => onAbrirSala(s.codigo)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[#3a2614]"
            >
              <span className="truncate">
                {s.brancas ?? '…'} × {s.pretas ?? '…'}
              </span>
              <span className="shrink-0 text-[#c9b48a]">{rotuloDoResultado(t, s)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
