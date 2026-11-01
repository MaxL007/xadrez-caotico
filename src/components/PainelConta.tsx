import { useState, type FormEvent } from 'react'
import type { ChaveTexto, Traduzir } from '../chess/idiomas'
import { useResumoDaNuvem } from '../db/db'
import { criarConta, entrarNaConta, ErroDoServidor, excluirConta, recuperarConta, sairDaConta, useSessao } from '../db/servidor'

// Conta do jogador. As cores são as da tela inicial, por cima do tabuleiro.

const TAMANHO_MINIMO_SENHA = 8
const campo = 'w-full rounded-lg border border-[#c9a24a]/40 bg-[#2a1c10] px-3 py-2 text-sm text-[#f5e6c8] outline-none placeholder:text-[#8f7a58] focus:border-[#e6c675]'
const botaoCheio = 'w-full rounded-lg bg-[#c9a24a] px-4 py-2 text-sm font-semibold text-[#1c120a] transition hover:bg-[#e6c675] disabled:opacity-50'
const botaoLink = 'text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline'

function Campo({ rotulo, ...props }: { rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#c9b48a]">{rotulo}</span>
      <input className={campo} {...props} />
    </label>
  )
}

const mensagemDeErro = (erro: unknown): ChaveTexto => {
  const codigo = erro instanceof ErroDoServidor ? erro.message : ''
  if (codigo === 'credenciais') return 'conta.erroCredenciais'
  if (codigo === 'nome-em-uso') return 'conta.erroNomeEmUso'
  if (codigo === 'nome-invalido') return 'conta.erroNomeInvalido'
  if (codigo === 'muitas-tentativas') return 'conta.erroTentativas'
  return 'conta.erroConexao'
}

/** O código só existe nesta tela: o servidor guarda apenas uma versão protegida dele. */
function CodigoDeRecuperacao({ t, codigo, onFechar }: { t: Traduzir; codigo: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{t('conta.codigoTitulo')}</p>
      <p className="text-xs text-[#c9b48a]">{t('conta.codigoAviso')}</p>
      <p className="select-all rounded-lg bg-[#2a1c10] px-3 py-2 text-center font-mono text-sm tracking-wide" data-codigo-recuperacao>
        {codigo}
      </p>
      <button
        type="button"
        className={botaoLink}
        onClick={() => {
          void navigator.clipboard?.writeText(codigo).then(() => setCopiado(true))
        }}
      >
        {copiado ? t('conta.copiado') : t('conta.copiar')}
      </button>
      <button type="button" className={botaoCheio} onClick={onFechar}>
        {t('conta.jaGuardei')}
      </button>
    </div>
  )
}

function Conectado({ t }: { t: Traduzir }) {
  const sessao = useSessao()
  const { estado, pendentes } = useResumoDaNuvem()
  const [excluindo, setExcluindo] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<ChaveTexto | null>(null)

  async function confirmarExclusao(e: FormEvent) {
    e.preventDefault()
    try {
      await excluirConta(senha)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {t('conta.logado')} <strong>{sessao?.usuario.nome}</strong>
      </p>
      <p className="text-xs text-[#c9b48a]" data-estado-nuvem={estado}>
        {t(estado === 'conectado' ? 'conta.nuvemConectada' : estado === 'sem-conexao' ? 'conta.nuvemSemConexao' : 'conta.nuvemVerificando')}
        {pendentes > 0 ? ` ${t('conta.nuvemPendentes', { n: pendentes })}` : ''}
      </p>
      <button type="button" className={botaoCheio} onClick={() => void sairDaConta()}>
        {t('conta.sair')}
      </button>
      {!excluindo ? (
        <button type="button" className={botaoLink} onClick={() => setExcluindo(true)}>
          {t('conta.excluir')}
        </button>
      ) : (
        <form className="space-y-2 border-t border-[#c9a24a]/20 pt-3" onSubmit={confirmarExclusao}>
          <p className="text-xs text-[#c9b48a]">{t('conta.excluirAviso')}</p>
          <Campo rotulo={t('conta.senha')} type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          {erro && <p className="text-xs font-medium text-[#ffb4a8]">{t(erro)}</p>}
          <button type="submit" disabled={!senha} className="w-full rounded-lg bg-[#9b2c2c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t('conta.excluirConfirmar')}
          </button>
        </form>
      )}
    </div>
  )
}

export function PainelConta({ t, onConcluir, onCodigoNaTela }: { t: Traduzir; onConcluir?: () => void; onCodigoNaTela?: (naTela: boolean) => void }) {
  const sessao = useSessao()
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [codigoNovo, setCodigoNovo] = useState<string | null>(null)

  function mostrarCodigo(codigo: string) {
    setCodigoNovo(codigo)
    onCodigoNaTela?.(true)
  }

  if (codigoNovo) {
    return (
      <CodigoDeRecuperacao
        t={t}
        codigo={codigoNovo}
        onFechar={() => {
          setCodigoNovo(null)
          onCodigoNaTela?.(false)
          onConcluir?.()
        }}
      />
    )
  }
  if (sessao) return <Conectado t={t} />

  function trocarModo(novo: typeof modo) {
    setModo(novo)
    setErro(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (modo !== 'entrar' && senha.length < TAMANHO_MINIMO_SENHA) return setErro('conta.erroSenhaCurta')
    if (modo !== 'entrar' && senha !== repetir) return setErro('conta.erroSenhasDiferentes')
    setEnviando(true)
    setErro(null)
    try {
      if (modo === 'entrar') {
        await entrarNaConta(nome, senha)
        onConcluir?.()
      } else if (modo === 'criar') mostrarCodigo(await criarConta(nome, senha))
      else mostrarCodigo(await recuperarConta(nome, codigo, senha))
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={enviar}>
      <p className="text-xs text-[#c9b48a]">{t('conta.explicacao')}</p>
      <Campo rotulo={t('conta.nome')} autoComplete="username" maxLength={20} value={nome} onChange={(e) => setNome(e.target.value)} />
      {modo === 'recuperar' && <Campo rotulo={t('conta.codigo')} autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} />}
      <Campo
        rotulo={t(modo === 'recuperar' ? 'conta.senhaNova' : 'conta.senha')}
        type="password"
        autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
      />
      {modo !== 'entrar' && <Campo rotulo={t('conta.repetirSenha')} type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />}
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}
      <button type="submit" className={botaoCheio} disabled={enviando || !nome.trim() || !senha}>
        {enviando ? t('conta.aguarde') : t(modo === 'entrar' ? 'conta.entrar' : modo === 'criar' ? 'conta.criar' : 'conta.recuperar')}
      </button>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className={botaoLink} onClick={() => trocarModo(modo === 'entrar' ? 'criar' : 'entrar')}>
          {t(modo === 'entrar' ? 'conta.irCriar' : 'conta.irEntrar')}
        </button>
        {modo === 'entrar' && (
          <button type="button" className={botaoLink} onClick={() => trocarModo('recuperar')}>
            {t('conta.esqueci')}
          </button>
        )}
      </div>
    </form>
  )
}
