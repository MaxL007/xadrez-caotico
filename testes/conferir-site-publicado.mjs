// Confere o site publicado de verdade, falando com o servidor publicado: um navegador cria uma conta pela
// tela e chama um amigo; um cliente aqui no Node faz o papel do amigo. Sem placa de vídeo só cabe um 3D por
// vez, e no site publicado não há os ganchos de teste: os cliques são nas casas, pela posição na tela.
// As duas contas são apagadas no fim. Cada rodada gasta 2 das 5 contas por hora do endereço.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const API = process.env.API
const SITE = 'https://maxl007.github.io/xadrez-caotico/'
const ORIGEM = 'https://maxl007.github.io'
const FOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'saidas')
fs.mkdirSync(FOTOS, { recursive: true })

let falhas = 0
function conferir(nome, ok, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

async function api(metodo, caminho, token, corpo) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { Origin: ORIGEM, ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

const sufixo = Date.now().toString(36).slice(-6)
const nomeTela = `Tela ${sufixo}`
const nomeRival = `Rival ${sufixo}`
const SENHA = 'senha-temporaria'
const derivar = (nome, rodadas) => crypto.pbkdf2Sync(SENHA, `xadrez-caotico:v1:${nome.toLowerCase()}`, rodadas, 32, 'sha256').toString('base64')

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
page.setDefaultTimeout(120000)
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text().slice(0, 200))
})
await page.addInitScript(() => {
  if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
})
const botao = (nome) => page.locator('main').getByRole('button', { name: nome, exact: true })

let tokenTela = null
let rival = null
let ws = null
const recebidos = []

try {
  await page.goto(SITE, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('heading', { name: 'Xadrez Caótico' }).waitFor()
  await page.waitForTimeout(2500)

  await page.locator('main').getByRole('button', { name: /^Amigos/ }).click()
  await page.getByRole('button', { name: 'Criar uma conta' }).click()
  await page.getByLabel('Nome de jogador').fill(nomeTela)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByLabel('Repita a senha').fill(SENHA)
  await botao('Criar conta').click()
  await page.locator('[data-codigo-recuperacao]').waitFor()
  conferir('cria a conta pela tela do site publicado', true)
  tokenTela = await page.evaluate(() => JSON.parse(localStorage.getItem('xadrezCaotico:sessao')).token)
  conferir('o código de recuperação aparece', /^[A-Z0-9-]{19}$/.test(await page.locator('[data-codigo-recuperacao]').innerText()))
  conferir('nesse momento não dá pra sair da tela do código', (await botao('Voltar').count()) === 0)
  await botao('Já guardei').click()

  await page.locator('[data-meu-id]').waitFor()
  rival = (await api('POST', '/contas', null, { nome: nomeRival, chave: derivar(nomeRival, 1000) })).json
  conferir('o amigo convida pelo nome', (await api('POST', '/amigos', rival.token, { busca: nomeTela })).json?.status === 'pendente')
  await botao('Confirmar').click({ timeout: 60000 })
  await page.locator('[data-amigo]').waitFor()
  conferir('o convite chega à tela e vira amizade', true)

  await botao('Partida amistosa').click()
  await botao('Brancas').click()
  await page.locator('[data-convite]').waitFor()
  const chamada = (await api('GET', '/amigos', rival.token)).json?.partidasRecebidas?.[0]
  const codigo = chamada?.codigo
  conferir('o amigo recebe a partida amistosa', chamada?.nome === nomeTela, codigo)
  conferir('o amigo aceita', (await api('POST', `/salas/${codigo}/entrar`, rival.token)).json?.cor === 'b')
  await page.getByText(`Contra ${nomeRival}`).first().waitFor()
  conferir('a tela mostra contra quem é a partida', true)

  ws = new WebSocket(`${API.replace(/^http/, 'ws')}/salas/${codigo}/ws`, { protocols: ['xadrez', rival.token], headers: { Origin: ORIGEM } })
  ws.onmessage = (e) => recebidos.push(JSON.parse(e.data))
  await new Promise((ok) => (ws.onopen = ok))
  await page.locator('[data-convite]').waitFor({ state: 'detached' })
  await page.waitForTimeout(6000)

  // o clique de verdade, numa peça do tabuleiro
  const quadro = await page.locator('canvas').first().boundingBox()
  const clicar = (x, y) => page.mouse.click(quadro.x + quadro.width * x, quadro.y + quadro.height * y)
  await clicar(0.535, 0.739) // e2
  await page.waitForTimeout(1500)
  await clicar(0.5285, 0.573) // e4
  let chegou = null
  for (let t = 0; t < 60000 && !chegou; t += 300) {
    chegou = recebidos.find((m) => m.t === 'lance' && m.n === 0)
    await page.waitForTimeout(300)
  }
  conferir('o clique no tabuleiro chega ao adversário pela internet', !!chegou, chegou?.san ?? 'nada chegou')
  await page.waitForTimeout(9000)
  await page.screenshot({ path: path.join(FOTOS, 'publicado-partida.png'), timeout: 150000 }).catch(() => console.log('  (sem foto)'))

  ws.send(JSON.stringify({ t: 'lance', n: 1, de: 'e7', para: 'e5' }))
  await page.getByText(/^Sua vez/).first().waitFor({ timeout: 60000 })
  conferir('o lance do adversário chega ao tabuleiro e a vez volta', true)

  ws.send(JSON.stringify({ t: 'desistir' }))
  await page.getByText(`${nomeRival} desistiu. Você venceu!`).first().waitFor({ timeout: 60000 })
  conferir('o adversário desiste e a tela mostra a vitória', true)
  await page.screenshot({ path: path.join(FOTOS, 'publicado-fim.png'), timeout: 150000 }).catch(() => console.log('  (sem foto)'))
  const reais = erros.filter((e) => !/status of 401|status of 404/.test(e))
  conferir('sem erros no navegador nem bloqueio de CORS', reais.length === 0, reais.join(' | ').slice(0, 300))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
  console.log('erros:', erros.join(' | ').slice(0, 400))
  await page.screenshot({ path: path.join(FOTOS, 'publicado-erro.png'), timeout: 60000 }).catch(() => {})
} finally {
  ws?.close()
  if (tokenTela) conferir('conta da tela apagada', (await api('POST', '/contas/excluir', tokenTela, { chave: derivar(nomeTela, 600000) })).status === 200)
  if (rival) conferir('conta do adversário apagada', (await api('POST', '/contas/excluir', rival.token, { chave: derivar(nomeRival, 1000) })).status === 200)
  await browser.close()
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
process.exit(falhas ? 1 : 0)
