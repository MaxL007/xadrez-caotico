import { useEffect, useState, type FormEvent } from 'react'
import type { ChaveTexto, Traduzir } from '../chess/idiomas'
import { criarSala, entrarEmSala, ErroDoServidor, listarSalas, useSessao, type SalaNaLista } from '../db/servidor'
import { PainelConta } from './PainelConta'

// Partida contra outra pessoa: criar um convite, entrar com um código ou voltar a uma partida.

const botaoCor = 'rounded-lg border border-[#c9a24a]/40 px-3 py-2 text-sm font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614] disabled:opacity-50'

const mensagemDeErro = (erro: unknown): ChaveTexto => {
  const codigo = erro instanceof ErroDoServidor ? erro.message : ''
  if (codigo === 'sala-nao-existe') return 'online.erroNaoExiste'
  if (codigo === 'sala-cheia') return 'online.erroCheia'
  if (codigo === 'sala-encerrada') return 'online.erroEncerrada'
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

export function PainelOnline({
  t,
  codigoDoConvite,
  onAbrirSala,
  onCodigoNaTela,
}: {
  t: Traduzir
  codigoDoConvite: string | null
  onAbrirSala: (codigo: string) => void
  onCodigoNaTela: (naTela: boolean) => void
}) {
  const sessao = useSessao()
  const [codigo, setCodigo] = useState(codigoDoConvite ?? '')
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [salas, setSalas] = useState<SalaNaLista[]>([])
  // quem cria a conta aqui precisa ver o código de recuperação antes de cair na partida
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
        // sem conexão: o painel abre só com as opções de criar e entrar
      })
    return () => {
      cancelado = true
    }
  }, [logado])

  async function executar(acao: () => Promise<{ codigo: string }>) {
    setEnviando(true)
    setErro(null)
    try {
      onAbrirSala((await acao()).codigo)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
      setEnviando(false)
    }
  }

  // veio por um link de convite: entra sozinho assim que houver conta
  useEffect(() => {
    if (logado && codigoDoConvite) void executar(() => entrarEmSala(codigoDoConvite))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logado, codigoDoConvite])

  if (!logado) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{t(codigoDoConvite ? 'online.conviteRecebido' : 'online.precisaConta')}</p>
        <PainelConta t={t} onConcluir={() => setNaTelaDaConta(false)} onCodigoNaTela={onCodigoNaTela} />
      </div>
    )
  }

  function entrar(e: FormEvent) {
    e.preventDefault()
    const normalizado = codigo.trim().toUpperCase()
    void executar(() => entrarEmSala(normalizado))
  }

  const abertas = salas.filter((s) => s.status === 'andamento' || s.status === 'aguardando')
  const encerradas = salas.filter((s) => s.status === 'fim').slice(0, 5)

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">{t('online.criar')}</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={botaoCor} disabled={enviando} onClick={() => void executar(() => criarSala('w'))}>
            {t('cor.brancas')}
          </button>
          <button type="button" className={botaoCor} disabled={enviando} onClick={() => void executar(() => criarSala('b'))}>
            {t('cor.pretas')}
          </button>
          <button type="button" className={botaoCor} disabled={enviando} onClick={() => void executar(() => criarSala('sorteio'))}>
            {t('online.sorteio')}
          </button>
        </div>
      </div>

      <form className="space-y-2 border-t border-[#c9a24a]/20 pt-3" onSubmit={entrar}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('online.entrarCodigo')}</span>
          <input
            className="w-full rounded-lg border border-[#c9a24a]/40 bg-[#2a1c10] px-3 py-2 font-mono text-sm uppercase tracking-widest text-[#f5e6c8] outline-none focus:border-[#e6c675]"
            maxLength={8}
            autoComplete="off"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </label>
        <button type="submit" className={`${botaoCor} w-full`} disabled={enviando || codigo.trim().length !== 8}>
          {t('online.entrar')}
        </button>
      </form>

      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}

      {(abertas.length > 0 || encerradas.length > 0) && (
        <div className="space-y-1 border-t border-[#c9a24a]/20 pt-3">
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
