// Registro de erros: quando algo quebra no aparelho de alguém, o jogo manda ao servidor a mensagem, onde foi, a versão
// e o tipo de navegador. Nada de nome, ID ou endereço da página com códigos (só o caminho). O servidor junta os
// repetidos e apaga em 30 dias. Ver com:
//   npx wrangler d1 execute xadrez-caotico --remote --command "SELECT vezes, mensagem, onde, versao, navegador FROM erros ORDER BY visto_em DESC LIMIT 20"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
/** No máximo 5 relatórios por página aberta, e cada erro uma vez só: um erro em laço não vira enxurrada. */
const MAXIMO_POR_PAGINA = 5
const enviados = new Set<string>()

/** A versão do site: o nome do arquivo do jogo muda a cada publicação (index-XXXX.js). */
function versaoDoSite(): string {
  if (!import.meta.env.PROD) return 'dev'
  return import.meta.url.match(/index-([\w-]+)\.js/)?.[1] ?? 'site'
}

const NAVEGADORES: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/CriOS\/(\d+)/, 'Chrome'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^ ]*(?: Mobile\/\S+)? Safari/, 'Safari'],
]
const SISTEMAS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
]

/** Só o nome e a versão principal do navegador e o sistema ("Chrome 131 · Android"): o texto inteiro do navegador
 * ajudaria a reconhecer o aparelho de alguém. */
export function resumoDoNavegador(texto = navigator.userAgent, instalado = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches): string {
  let navegador = 'outro'
  for (const [padrao, nome] of NAVEGADORES) {
    const achou = texto.match(padrao)
    if (achou) {
      navegador = `${nome} ${achou[1]}`
      break
    }
  }
  const sistema = SISTEMAS.find(([padrao]) => padrao.test(texto))?.[1] ?? 'outro'
  return `${navegador} · ${sistema}${instalado ? ' · app' : ''}`
}

/** Falhas de rede e avisos do próprio navegador: não são defeitos do jogo. */
function ehRuido(mensagem: string): boolean {
  return /ResizeObserver loop|^Script error\.?$|Failed to fetch|NetworkError|Load failed|AbortError|The user aborted|sem-conexao|Importing a module script failed|dynamically imported module/i.test(
    mensagem,
  )
}

function enviar(mensagem: string, pilha: string | undefined) {
  mensagem = mensagem.trim()
  if (!mensagem || ehRuido(mensagem)) return
  // nos testes o jogo roda em modo de desenvolvimento: lá só manda quando o teste pede
  if (!import.meta.env.PROD && !(window as unknown as { __enviarErros?: boolean }).__enviarErros) return
  const chave = `${mensagem}\n${pilha?.split('\n')[1] ?? ''}`
  if (enviados.has(chave) || enviados.size >= MAXIMO_POR_PAGINA) return
  enviados.add(chave)
  void fetch(`${API}/erros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ mensagem, pilha: pilha?.slice(0, 2000), onde: location.pathname, versao: versaoDoSite(), navegador: resumoDoNavegador() }),
  }).catch(() => {
    // sem conexão: o erro se perde, sem tentar de novo
  })
}

function textoDoMotivo(motivo: unknown): { mensagem: string; pilha?: string } {
  if (motivo instanceof Error) return { mensagem: `${motivo.name}: ${motivo.message}`, pilha: motivo.stack }
  if (typeof motivo === 'string') return { mensagem: motivo }
  return { mensagem: 'rejeição sem Error' }
}

/** Para os erros que o jogo pega mas que não deviam acontecer. */
export function registrarErro(erro: unknown, onde?: string) {
  const { mensagem, pilha } = textoDoMotivo(erro)
  enviar(onde ? `${onde}: ${mensagem}` : mensagem, pilha)
}

export function iniciarRegistroDeErros() {
  window.addEventListener('error', (evento) => {
    // erro de extensão do navegador ou de script de outro site: não é do jogo
    if (evento.filename && !evento.filename.startsWith(location.origin)) return
    const erro = evento.error as unknown
    if (erro instanceof Error) enviar(`${erro.name}: ${erro.message}`, erro.stack)
    else enviar(evento.message, `${evento.filename}:${evento.lineno}:${evento.colno}`)
  })
  window.addEventListener('unhandledrejection', (evento) => {
    const { mensagem, pilha } = textoDoMotivo(evento.reason)
    enviar(`(promessa) ${mensagem}`, pilha)
  })
}
