// O registro de erros: o servidor recebe só de origem permitida, limpa o texto (sem códigos secretos, com limite de
// tamanho), junta os repetidos e limita por endereço; o site manda os erros soltos e as promessas rejeitadas, cada um uma
// vez, sem nada da pessoa. Precisa do site (npm run dev) e do servidor local (npm run dev em worker/).
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const API = process.env.API ?? 'http://127.0.0.1:8787'
const ORIGEM = 'http://127.0.0.1:5184'
const SITE = `${ORIGEM}/xadrez-caotico/`
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const marca = crypto.randomBytes(4).toString('hex')

/** Consulta o banco do simulador. */
function consultar(sql) {
  const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker')
  const saida = execFileSync(process.execPath, [path.join(pasta, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'xadrez-caotico', '--local', '--json', '--command', sql], {
    cwd: pasta,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()
  return JSON.parse(saida.slice(saida.indexOf('[')))[0].results
}
const linhasCom = (trecho) => consultar(`SELECT * FROM erros WHERE mensagem LIKE '%${trecho}%'`)

let endereco = 0
async function relatar(corpo, { origem = ORIGEM, ip = `198.51.100.${++endereco}` } = {}) {
  const r = await fetch(`${API}/erros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(origem ? { Origin: origem } : {}) },
    body: JSON.stringify(corpo),
  })
  return r.status
}

// --- o servidor -------------------------------------------------------------------------------------------------------
conferir('sem origem: recusa', (await relatar({ mensagem: `sem origem ${marca}` }, { origem: null })) === 403)
conferir('origem de fora: recusa', (await relatar({ mensagem: `de fora ${marca}` }, { origem: 'https://outro.exemplo' })) === 403)
conferir('sem mensagem: recusa', (await relatar({ onde: '/x' })) === 400)
const corpo = { mensagem: `Erro de teste ${marca}`, pilha: 'at algum lugar', onde: '/xadrez-caotico/', versao: 'teste', navegador: 'Chrome 131 · Windows' }
conferir('aceita um relatório', (await relatar(corpo)) === 200)
conferir('aceita o mesmo de novo', (await relatar(corpo)) === 200)
let linhas = linhasCom(`Erro de teste ${marca}`)
conferir('o repetido só soma', linhas.length === 1 && linhas[0].vezes === 2, JSON.stringify(linhas.map((l) => l.vezes)))
conferir('nada da pessoa na tabela', linhas.length === 1 && !Object.keys(linhas[0]).some((c) => /usuario|ip|endereco|nome/.test(c)), Object.keys(linhas[0] ?? {}).join(','))

const segredo = crypto.randomBytes(30).toString('base64url')
await relatar({ mensagem: `Com token ${marca} ${segredo} no meio`, pilha: Array.from({ length: 200 }, (_, i) => `    at funcao${i} (arquivo.js:${i}:7)`).join('\n') })
linhas = linhasCom(`Com token ${marca}`)
conferir('código secreto sai do texto', linhas.length === 1 && !linhas[0].mensagem.includes(segredo) && linhas[0].mensagem.includes('…'), linhas[0]?.mensagem)
conferir('pilha cortada em 2000', linhas[0]?.pilha?.length === 2000, String(linhas[0]?.pilha?.length))

const ip = `198.51.100.${200 + Math.floor(Math.random() * 50)}`
const respostas = []
for (let i = 0; i < 31; i++) respostas.push(await relatar({ mensagem: `Enxurrada ${marca} ${i}` }, { ip }))
conferir('30 por hora do mesmo endereço, o 31º espera', respostas.slice(0, 30).every((s) => s === 200) && respostas[30] === 429, respostas.slice(28).join(','))

// --- o site -----------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage()
  page.setDefaultTimeout(120000)
  await page.addInitScript(() => {
    window.__semDesenho = true
    window.__enviarErros = true
    localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
  })
  const enviados = []
  page.on('request', (r) => {
    if (r.url().endsWith('/erros')) enviados.push(JSON.parse(r.postData() ?? '{}'))
  })
  await page.goto(`${SITE}?convite=ABCDEFGHJKMN#algo`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { polling: 500 })
  // um script da própria página (o de extensão ou de outro site o jogo ignora)
  await page.addScriptTag({
    content: `
      const lancar = () => setTimeout(() => { throw new TypeError('erro solto ${marca}') })
      lancar()
      lancar()
      Promise.reject(new Error('promessa ${marca}'))
      Promise.reject(new TypeError('Failed to fetch'))
    `,
  })
  // espera os dois chegarem (até 15 s) e mais um pouco, pra ver que nada repetido vai depois
  for (let i = 0; i < 60 && !(['erro solto', 'promessa'].every((m) => enviados.some((e) => e.mensagem.includes(`${m} ${marca}`)))); i++) await espera(250)
  await espera(1500)
  const solto = enviados.filter((e) => e.mensagem.includes(`erro solto ${marca}`))
  const promessa = enviados.filter((e) => e.mensagem.includes(`promessa ${marca}`))
  conferir('o erro solto vai uma vez só', solto.length === 1, String(solto.length))
  conferir('a promessa rejeitada vai', promessa.length === 1 && promessa[0].mensagem.startsWith('(promessa)'), enviados.map((e) => e.mensagem).join(' | '))
  conferir('falha de rede não vai', !enviados.some((e) => /Failed to fetch/.test(e.mensagem)))
  conferir('só o caminho da página, sem o convite', solto[0]?.onde === '/xadrez-caotico/', solto[0]?.onde)
  conferir('o navegador vai resumido', /^Chrome \d+ · \w+$/.test(solto[0]?.navegador ?? ''), solto[0]?.navegador)
  conferir('sem nada da pessoa no relatório', solto.length === 1 && Object.keys(solto[0]).sort().join(',') === 'mensagem,navegador,onde,pilha,versao', Object.keys(solto[0] ?? {}).join(','))
  linhas = linhasCom(`erro solto ${marca}`)
  conferir('chegou no banco', linhas.length === 1 && linhas[0].versao === 'dev', JSON.stringify(linhas[0] ?? {}).slice(0, 160))
} finally {
  await browser.close()
}

console.log(falhas ? `\n${falhas} conferência(s) falharam` : '\ntudo certo')
process.exit(falhas ? 1 : 0)
