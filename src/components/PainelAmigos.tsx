import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChaveTexto, Idioma, Traduzir } from '../chess/idiomas'
import { convidarAmigo, criarSala, entrarEmSala, ErroDoServidor, listarSalas, recusarSala, removerAmigo, useSessao, verPerfil, type Amigos, type Jogador, type Perfil, type SalaNaLista } from '../db/servidor'
import { Avatar, MeuId, Placar } from './ElementosDoJogador'
import { PainelConta } from './PainelConta'
import { LeitorDeQrCode, QrCode } from './QrCode'
import { linkDoConvite, receberConviteLido, type ResultadoDoConvite } from '../conta/conviteDeAmizade'
import { PainelConquistas } from './PainelConquistas'
import { CONQUISTAS, type Contagem } from '../chess/conquistas'

// Amigos: os pedidos de amizade, o ID e o convite por link e QR Code de quem joga, a lista de amigos (com a bolinha de
// quem está com o jogo aberto) e as partidas amistosas com eles.

/** As conquistas que o amigo já recebeu ou alcançou. */
const conquistasFeitas = ({ conquistas }: Perfil) =>
  CONQUISTAS.filter((c) => conquistas.recebidas.includes(c.id) || (conquistas.contagem[c.medida] ?? 0) >= c.meta).length

/** Acesa e verde: o amigo está com o jogo aberto agora. Só o contorno: está fora. */
function BolinhaOnline({ t, online }: { t: Traduzir; online?: boolean }) {
  const rotulo = t(online ? 'amigos.online' : 'amigos.offline')
  return (
    <span
      role="img"
      aria-label={rotulo}
      title={rotulo}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-[#3fd36b] shadow-[0_0_6px_rgba(63,211,107,0.9)]' : 'border border-[#8f7a58]'}`}
      data-online={online ? 'sim' : 'nao'}
    />
  )
}

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

const mensagemDoConvite = (t: Traduzir, resultado: ResultadoDoConvite) => {
  if (resultado.tipo === 'pedido') return t('amigos.conviteLido', { nome: resultado.de.nome })
  if (resultado.tipo === 'amigos') return t('convite.viraramAmigos', { nome: resultado.de.nome })
  if (resultado.tipo === 'jaAmigos') return t('convite.jaAmigos')
  if (resultado.tipo === 'proprio') return t('convite.proprio')
  if (resultado.tipo === 'invalido') return t('convite.invalido')
  return t('conta.erroConexao')
}

/** O convite fixo de quem joga: o link pra mandar, o QR Code pra mostrar e a câmera pra ler o de um amigo. */
function ConvitePorLink({ t, codigo, onLido }: { t: Traduzir; codigo: string; onLido: () => Promise<void> }) {
  const link = linkDoConvite(codigo)
  const [copiado, setCopiado] = useState(false)
  const [mostrandoQr, setMostrandoQr] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [aviso, setAviso] = useState('')
  const lidoRef = useRef('')

  async function aoLer(texto: string) {
    // a câmera lê o mesmo código várias vezes por segundo: cada leitura vale uma vez
    if (texto === lidoRef.current) return
    lidoRef.current = texto
    const resultado = await receberConviteLido(texto)
    if (!resultado) {
      setAviso(t('amigos.qrNaoEConvite'))
      return
    }
    setLendo(false)
    setAviso(mensagemDoConvite(t, resultado))
    await onLido()
  }

  return (
    <div className="space-y-2 rounded-lg bg-[#2a1c10] px-3 py-2.5" data-convite-link>
      <p className="text-sm font-medium">{t('amigos.conviteTitulo')}</p>
      <p className="text-xs text-[#c9b48a]">{t('amigos.conviteDica')}</p>
      <p className="select-all break-all font-mono text-[0.7rem] text-[#f5e6c8]" data-meu-link>
        {link}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={botaoPequeno} onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopiado(true))}>
          {t(copiado ? 'amigos.linkCopiado' : 'amigos.copiarLink')}
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className={botaoPequeno} onClick={() => void navigator.share({ title: t('titulo'), text: t('amigos.textoDoConvite'), url: link }).catch(() => undefined)}>
            {t('amigos.compartilhar')}
          </button>
        )}
        <button type="button" className={botaoPequeno} aria-expanded={mostrandoQr} onClick={() => setMostrandoQr((aberto) => !aberto)}>
          {t(mostrandoQr ? 'amigos.esconderQr' : 'amigos.mostrarQr')}
        </button>
      </div>
      {mostrandoQr && (
        <div className="flex justify-center py-1">
          <QrCode texto={link} tamanho={208} rotulo={t('amigos.mostrarQr')} />
        </div>
      )}
      <button
        type="button"
        className={`${botaoCor} w-full`}
        aria-expanded={lendo}
        onClick={() => {
          lidoRef.current = ''
          setAviso('')
          setLendo((aberto) => !aberto)
        }}
      >
        {t(lendo ? 'amigos.fecharCamera' : 'amigos.lerQr')}
      </button>
      {lendo && <LeitorDeQrCode t={t} onLido={(texto) => void aoLer(texto)} />}
      {aviso && (
        <p role="status" className="text-xs font-medium text-[#c9b48a]" data-aviso-convite>
          {aviso}
        </p>
      )}
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
  const [aba, setAba] = useState<'perfil' | 'conquistas'>('perfil')

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
      <div className="flex items-center gap-4 pt-1">
        <Avatar jogador={amigo} tamanho={72} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="min-w-0 truncate">{amigo.nome}</span>
            <BolinhaOnline t={t} online={perfil?.online ?? amigo.online} />
          </p>
          <p className="font-mono text-xs text-[#c9b48a]">{t('amigos.perfilId', { id: amigo.idJogador })}</p>
          {perfil && <p className="text-xs text-[#c9b48a]">{t('amigos.perfilDesde', { data: new Date(perfil.desde).toLocaleDateString(idioma) })}</p>}
        </div>
      </div>
      {falhou && <p className="text-xs font-medium text-[#ffb4a8]">{t('conta.erroConexao')}</p>}
      {perfil && (
        <>
          <div role="tablist" aria-label={amigo.nome} className="grid grid-cols-2 gap-1">
            {(
              [
                ['perfil', t('menu.perfil')],
                ['conquistas', t('perfil.abaConquistas', { feitas: conquistasFeitas(perfil), total: CONQUISTAS.length })],
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
          {aba === 'perfil' ? (
            <>
              <div>
                <p className="mb-1 text-sm font-medium">{t('amigos.perfilAmistosas')}</p>
                <Placar t={t} retrospecto={perfil.geral} />
              </div>
              <p className="text-xs text-[#c9b48a]">
                {t('amigos.perfilEntreVoces', { minhas: perfil.entreVoces.derrotas, nome: amigo.nome, deles: perfil.entreVoces.vitorias, empates: perfil.entreVoces.empates })}
              </p>
            </>
          ) : (
            // o progresso que o aparelho do amigo contou nas partidas dele contra a máquina
            <PainelConquistas t={t} doAmigo situacao={{ contagem: perfil.conquistas.contagem as Contagem, oticoins: null, recebidas: perfil.conquistas.recebidas }} />
          )}
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

  return (
    <div className="space-y-4">
      {!!amigos?.convitesRecebidos.length && (
        <div className="space-y-2 rounded-xl border border-[#e6c675]/60 bg-[#2a1c10] p-3" data-pedidos>
          <p className="text-sm font-semibold">{t('amigos.convitesRecebidos')}</p>
          {amigos.convitesRecebidos.map((j) => (
            <div key={j.idJogador} className="space-y-2" data-pedido={j.idJogador}>
              <p className="flex items-center gap-2 text-sm">
                <Avatar jogador={j} tamanho={32} />
                <span className="min-w-0">{t('amigos.querSerAmigo', { nome: j.nome })}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={botaoCor} disabled={enviando} onClick={() => void mudar(() => convidarAmigo(j.idJogador))}>
                  {t('amigos.aceitar')}
                </button>
                <button type="button" className={botaoCor} disabled={enviando} onClick={() => void mudar(() => removerAmigo(j.idJogador))}>
                  {t('amigos.recusar')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {amigos && <MeuId t={t} id={amigos.meuId} />}
      {amigos && <ConvitePorLink t={t} codigo={amigos.meuConvite} onLido={onAtualizar} />}
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

      <div className={secao}>
        <p className="mb-1 text-sm font-medium">{t('amigos.lista')}</p>
        {amigos?.amigos.length === 0 && <p className="text-xs text-[#c9b48a]">{t('amigos.vazio')}</p>}
        {amigos?.amigos.map((amigo) => (
          <div key={amigo.idJogador} className="space-y-1.5 py-1" data-amigo={amigo.idJogador}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Avatar jogador={amigo} tamanho={32} />
              <span className="min-w-0 truncate">{amigo.nome}</span>
              <BolinhaOnline t={t} online={amigo.online} />
            </p>
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

      {abertas.length > 0 && (
        <div className={secao}>
          <p className="mb-1 text-sm font-medium">{t('online.minhas')}</p>
          {abertas.map((s) => (
            <button
              key={s.codigo}
              type="button"
              onClick={() => onAbrirSala(s.codigo)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[#3a2614]"
            >
              <span className="truncate">
                {s.brancas ?? '…'} × {s.pretas ?? '…'}
              </span>
              <span className="shrink-0 text-[#c9b48a]">{t(s.status === 'aguardando' ? 'online.listaAguardando' : 'online.listaAndamento')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
