// Convite de amizade por link e por QR Code, nos navegadores. O link aberto sem conta avisa quem convidou; ao criar a
// conta, o pedido chega e a aba Amigos pergunta se confirma. Quem já tem conta vê o aviso na tela inicial. E a câmera
// do jogo lê o QR Code que o próprio jogo desenhou: a câmera falsa do Chrome mostra esse QR Code.
// Precisa do simulador (worker) e do site no ar.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SAIDAS = path.join(AQUI, 'saidas')
fs.mkdirSync(SAIDAS, { recursive: true })
const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
const API = 'http://127.0.0.1:8787'
const ORIGEM = 'http://127.0.0.1:5184'
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

/** Conta feita direto no servidor, pra quem não precisa entrar pela tela. */
async function contaPeloServidor(nome) {
  const chave = crypto.pbkdf2Sync('senha-de-teste', `xadrez-caotico:v1:${nome.toLowerCase()}`, 1000, 32, 'sha256').toString('base64')
  const conta = await (await fetch(`${API}/contas`, { method: 'POST', headers: { Origin: ORIGEM, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, chave }) })).json()
  const amigos = await (await fetch(`${API}/amigos`, { headers: { Origin: ORIGEM, Authorization: `Bearer ${conta.token}` } })).json()
  return { nome, sessao: { token: conta.token, usuario: conta.usuario }, id: amigos.meuId, convite: amigos.meuConvite }
}
const amigosDe = async (conta) => (await fetch(`${API}/amigos`, { headers: { Origin: ORIGEM, Authorization: `Bearer ${conta.sessao.token}` } })).json()

/** A câmera falsa do Chrome lê um vídeo .y4m: um quadro com o QR Code desenhado pelo jogo, em preto e branco. */
function videoDoQrCode(caminhoDoSvg, lado, arquivo) {
  const escuros = new Set([...caminhoDoSvg.matchAll(/M(\d+),(\d+)/g)].map(([, x, y]) => `${x},${y}`))
  const [largura, altura] = [640, 480]
  const modulo = Math.floor(400 / lado)
  const x0 = Math.floor((largura - modulo * lado) / 2)
  const y0 = Math.floor((altura - modulo * lado) / 2)
  const luz = Buffer.alloc(largura * altura, 235)
  for (let y = 0; y < modulo * lado; y++) {
    for (let x = 0; x < modulo * lado; x++) if (escuros.has(`${Math.floor(x / modulo)},${Math.floor(y / modulo)}`)) luz[(y0 + y) * largura + x0 + x] = 16
  }
  const cor = Buffer.alloc((largura / 2) * (altura / 2), 128)
  fs.writeFileSync(arquivo, Buffer.concat([Buffer.from(`YUV4MPEG2 W${largura} H${altura} F10:1 Ip A1:1 C420jpeg\n`), Buffer.from('FRAME\n'), luz, cor, cor]))
}

const erros = []
async function abrirNavegador(camera) {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  if (camera) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`)
  const browser = await chromium.launch({ args })
  const contexto = await browser.newContext({ viewport: { width: 1100, height: 820 } })
  if (camera) await contexto.grantPermissions(['camera'], { origin: ORIGEM })
  return { browser, contexto }
}
async function novaPagina(contexto, sessao = null) {
  const page = await contexto.newPage()
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
  await page.addInitScript((sessao) => {
    window.__semDesenho = true
    localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
    if (sessao && !localStorage.getItem('xadrezCaotico:sessao')) localStorage.setItem('xadrezCaotico:sessao', JSON.stringify(sessao))
  }, sessao)
  return page
}
async function abrir(page, url = SITE) {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
}
const botao = (page, nome) => page.locator('main').getByRole('button', { name: nome, exact: true })
const abrirAmigos = (page) => page.locator('main').getByRole('button', { name: /^Amigos/ }).click()

const sufixo = Date.now().toString(36).slice(-5)
let aberto = null
try {
  const ana = await contaPeloServidor(`Ana ${sufixo}`)
  const caio = await contaPeloServidor(`Caio ${sufixo}`)
  const dani = await contaPeloServidor(`Dani ${sufixo}`)
  const nomeBia = `Bia ${sufixo}`
  const linkDaAna = `${SITE}?convite=${ana.convite}`
  const VIDEO = path.join(SAIDAS, 'convite-qr.y4m')

  // =================== o link e o QR Code de quem convida ===================
  aberto = await abrirNavegador()
  let page = await novaPagina(aberto.contexto, ana.sessao)
  await abrir(page)
  await abrirAmigos(page)
  await page.locator('[data-meu-link]').waitFor()
  conferir('a aba Amigos mostra o link de convite', (await page.locator('[data-meu-link]').innerText()) === linkDaAna, await page.locator('[data-meu-link]').innerText())
  await botao(page, 'Mostrar QR Code').click()
  const qr = page.locator('svg[data-qr-code]')
  await qr.waitFor()
  conferir('e o QR Code com o mesmo link', (await qr.getAttribute('data-qr-code')) === linkDaAna)
  await page.locator('[data-convite-link]').screenshot({ path: path.join(SAIDAS, 'convite-qr.png') })
  const lado = Number((await qr.getAttribute('viewBox')).split(' ')[2])
  videoDoQrCode(await qr.locator('path').getAttribute('d'), lado, VIDEO)
  await abrir(page, linkDaAna)
  await page.locator('[data-aviso-link="proprio"]').waitFor()
  conferir('abrir o próprio link avisa que é o seu convite', true)
  await aberto.browser.close()

  // =================== link aberto sem conta ===================
  aberto = await abrirNavegador()
  page = await novaPagina(aberto.contexto)
  await abrir(page, linkDaAna)
  const semConta = page.locator('[data-aviso-link="semConta"]')
  await semConta.waitFor()
  conferir('sem conta, a tela inicial avisa quem convidou', (await semConta.innerText()).includes(`${ana.nome} te convidou`), await semConta.innerText())
  conferir('o convite sai do endereço, pra não valer de novo', !page.url().includes('convite='), page.url())
  await semConta.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Criar uma conta' }).click()
  await page.getByLabel('Nome de jogador').fill(nomeBia)
  await page.getByLabel('Senha', { exact: true }).fill('senha-da-bia')
  await page.getByLabel('Repita a senha').fill('senha-da-bia')
  await botao(page, 'Criar conta').click()
  await page.locator('[data-codigo-recuperacao]').waitFor()
  await botao(page, 'Já guardei').click()
  const pedidoDaAna = page.locator(`[data-pedido="${ana.id}"]`)
  await pedidoDaAna.waitFor({ timeout: 30000 })
  conferir('ao criar a conta, o pedido da Ana chega perguntando se confirma', (await pedidoDaAna.innerText()).includes(`${ana.nome} quer ser seu amigo. Confirma?`), await pedidoDaAna.innerText())
  await pedidoDaAna.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await page.locator(`[data-amigo="${ana.id}"]`).waitFor({ timeout: 30000 })
  conferir('confirmar faz da Ana uma amiga', (await pedidoDaAna.count()) === 0)
  conferir('o convite guardado no aparelho é apagado', (await page.evaluate(() => localStorage.getItem('xadrezCaotico:convite'))) === null)
  await aberto.browser.close()

  // =================== link aberto com conta: aviso na tela inicial ===================
  aberto = await abrirNavegador()
  page = await novaPagina(aberto.contexto, caio.sessao)
  await abrir(page, linkDaAna)
  const aviso = page.locator(`[data-aviso-amizade="${ana.id}"]`)
  await aviso.waitFor({ timeout: 30000 })
  conferir('com conta, o pedido chega como aviso na tela inicial', (await aviso.innerText()).includes(`${ana.nome} quer ser seu amigo. Toque para responder.`), await aviso.innerText())
  await aviso.getByRole('button').first().click()
  await page.locator(`[data-pedido="${ana.id}"]`).getByRole('button', { name: 'Recusar', exact: true }).click()
  await page.locator(`[data-pedido="${ana.id}"]`).waitFor({ state: 'detached', timeout: 30000 })
  conferir('tocar no aviso abre Amigos, e recusar apaga o pedido', (await amigosDe(ana)).convitesEnviados.every((j) => j.idJogador !== caio.id))
  await botao(page, 'Voltar').click()
  conferir('o aviso não volta depois de respondido', (await aviso.count()) === 0)
  await aberto.browser.close()

  // =================== QR Code lido pela câmera do jogo ===================
  aberto = await abrirNavegador(VIDEO)
  page = await novaPagina(aberto.contexto, dani.sessao)
  await abrir(page)
  await abrirAmigos(page)
  await botao(page, '📷 Ler o QR Code de um amigo').click()
  const lido = page.locator('[data-aviso-convite]')
  await lido.waitFor({ timeout: 60000 })
  conferir('a câmera lê o QR Code da Ana', (await lido.innerText()).includes(`Convite de ${ana.nome} lido`), await lido.innerText())
  conferir('e fecha sozinha', (await page.locator('[data-leitor-qr]').count()) === 0)
  await page.locator(`[data-pedido="${ana.id}"]`).getByRole('button', { name: 'Confirmar', exact: true }).click()
  await page.locator(`[data-amigo="${ana.id}"]`).waitFor({ timeout: 30000 })
  conferir('confirmar o pedido do QR Code faz da Ana uma amiga', true)
  await aberto.browser.close()
  aberto = null

  const finais = (await amigosDe(ana)).amigos.map((a) => a.nome)
  conferir('a Ana ficou amiga da Bia e da Dani, e não do Caio', finais.includes(nomeBia) && finais.includes(dani.nome) && !finais.includes(caio.nome), finais.join(', '))
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await aberto?.browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
