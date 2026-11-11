// O jogo instalado como aplicativo: manifesto e ícones, arquivos guardados no aparelho, abrir sem internet, versão nova
// baixando só o que mudou e os botões de instalar e de atualizar. Usa o site de produção, depois do `npm run build`,
// servido por um servidor deste teste que anota cada arquivo pedido (o GitHub Pages faz o mesmo papel no ar).
import { createRequire } from 'module'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(AQUI, '..')
const DIST = path.join(RAIZ, 'dist')
const PORTA = 4184
const SITE = `http://127.0.0.1:${PORTA}/xadrez-caotico/`
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

if (!fs.existsSync(path.join(DIST, 'sw.js'))) throw new Error('Falta o build: npm run build')
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' }
const pedidos = []
/** Sem internet de verdade: o servidor derruba a conexão (o modo offline do navegador nem sempre vale pro service worker). */
let foraDoAr = false
const servidor = http.createServer((pedido, resposta) => {
  if (foraDoAr) {
    pedido.socket.destroy()
    return
  }
  const caminho = decodeURIComponent(new URL(pedido.url, SITE).pathname)
  pedidos.push(caminho)
  const relativo = caminho.replace(/^\/xadrez-caotico\//, '') || 'index.html'
  const arquivo = path.join(DIST, relativo)
  if (!caminho.startsWith('/xadrez-caotico/') || !arquivo.startsWith(DIST) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    resposta.writeHead(404).end()
    return
  }
  resposta.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream' }).end(fs.readFileSync(arquivo))
})
await new Promise((pronto) => servidor.listen(PORTA, '127.0.0.1', pronto))

const LIVRO = path.join(DIST, 'chess', 'livro.json')
const livroOriginal = fs.readFileSync(LIVRO)
const INDEX = path.join(DIST, 'index.html')
const indexDoBuild = fs.readFileSync(INDEX)
let copiaDaEntrada = null
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const configBaixa = () => localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
try {
  const contexto = await browser.newContext({ viewport: { width: 1100, height: 760 } })
  const page = await contexto.newPage()
  page.setDefaultTimeout(150000)
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 200)))
  await page.addInitScript(configBaixa)
  await page.goto(SITE, { waitUntil: 'load', timeout: 150000 })
  await page.locator('main').getByRole('button', { name: 'Novo jogo', exact: true }).waitFor()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 150000, polling: 500 })
  conferir('o service worker assume a página na primeira visita', true)

  // =================== manifesto e logo ===================
  const cdp = await contexto.newCDPSession(page)
  const { errors: errosDoManifesto } = await cdp.send('Page.getAppManifest')
  conferir('o manifesto é lido sem erro', errosDoManifesto.length === 0, JSON.stringify(errosDoManifesto))
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  conferir('o Chrome considera o jogo instalável', installabilityErrors.length === 0, JSON.stringify(installabilityErrors))
  const icones = await page.evaluate(async () => {
    const manifesto = await (await fetch(document.querySelector('link[rel=manifest]').href)).json()
    const extras = [...document.querySelectorAll('link[rel=icon], link[rel=apple-touch-icon]')].map((l) => l.href)
    const todos = [...manifesto.icons.map((i) => new URL(i.src, document.querySelector('link[rel=manifest]').href).href), ...extras]
    return Promise.all(todos.map(async (url) => ({ url, tipo: (await fetch(url)).headers.get('Content-Type') })))
  })
  conferir('os ícones da óticoin existem: aplicativo, Android, iPhone e aba', icones.length === 5 && icones.every((i) => i.tipo === 'image/png'), icones.map((i) => i.url.split('/').pop()).join(', '))
  conferir('a óticoin aparece como logo ao lado do título', await page.locator('[data-logo]').evaluate((img) => img.complete && img.naturalWidth === 192))

  // =================== guardado no aparelho ===================
  const lista = JSON.parse(/const ARQUIVOS = (\{[\s\S]*?\n\})/.exec(fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8'))[1])
  await page.waitForFunction((n) => caches.open('xadrez-caotico').then((c) => c.keys()).then((k) => k.length >= n), Object.keys(lista).length, { timeout: 150000, polling: 500 })
  const guardados = await page.evaluate(() => caches.open('xadrez-caotico').then((c) => c.keys()).then((k) => k.map((p) => new URL(p.url).pathname.replace('/xadrez-caotico/', ''))))
  conferir('todos os arquivos do site ficam no aparelho', Object.keys(lista).every((c) => guardados.includes(c)), `${Object.keys(lista).length} arquivos`)
  conferir('modelos 3D, livro de aberturas e código entre eles', ['models/peao_rpg.glb', 'chess/livro.json', 'index.html'].every((c) => guardados.includes(c)) && guardados.some((c) => /^assets\/ChessBoard3D-.*\.js$/.test(c)))
  conferir('o PGN e o LEIA-ME ficam de fora', !guardados.some((c) => c.endsWith('.pgn') || c.endsWith('.txt')))

  // =================== sem internet ===================
  await contexto.setOffline(true)
  foraDoAr = true
  await page.reload({ waitUntil: 'load' })
  await page.locator('main').getByRole('button', { name: 'Novo jogo', exact: true }).waitFor()
  await page.waitForFunction(() => !document.body.textContent.includes('Carregando o tabuleiro'), null, { timeout: 150000, polling: 500 })
  conferir('sem internet, o jogo abre com o tabuleiro', true)
  conferir('sem internet, o livro de aberturas vem do aparelho', await page.evaluate(() => fetch('chess/livro.json').then((r) => r.ok)))
  await contexto.setOffline(false)
  foraDoAr = false

  // =================== versão nova ===================
  // um arquivo muda (o livro) e a lista é refeita, como um build novo faria: o aparelho baixa só ele
  const gerarLista = () => execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'gerar-sw.mjs')], { stdio: 'pipe' })
  fs.writeFileSync(LIVRO, Buffer.concat([livroOriginal, Buffer.from('\n')]))
  gerarLista()
  pedidos.length = 0
  await page.reload({ waitUntil: 'load' })
  const livroNovo = () => page.evaluate(() => caches.open('xadrez-caotico').then((c) => c.match('chess/livro.json')).then((r) => r.text()).then((t) => t.endsWith('\n')))
  for (let t = 0; t < 150000 && !(await livroNovo()); t += 500) await page.waitForTimeout(500)
  conferir('a versão nova guarda o arquivo novo no lugar do velho', await livroNovo())
  const baixados = pedidos.filter((p) => !/\/(sw\.js|manifest\.webmanifest|icones\/.*)$/.test(p) && p !== '/xadrez-caotico/')
  conferir('e baixa só o arquivo que mudou', baixados.length === 1 && baixados[0] === '/xadrez-caotico/chess/livro.json', baixados.join(', '))
  conferir('quem abriu depois da versão nova não recebe aviso', (await page.locator('[data-versao-nova]').count()) === 0)

  // sai uma versão nova com a tela aberta: ao voltar pro aplicativo, ela avisa que está velha. A versão nova aqui é o
  // estilo com outro nome (copiar o código duplicaria o React, que os outros pedaços importam pelo nome do original)
  const indexOriginal = fs.readFileSync(INDEX, 'utf8')
  const entrada = /href="\/xadrez-caotico\/(assets\/index-[^"]+\.css)"/.exec(indexOriginal)[1]
  copiaDaEntrada = entrada.replace(/\.css$/, '-nova.css')
  fs.copyFileSync(path.join(DIST, entrada), path.join(DIST, copiaDaEntrada))
  fs.writeFileSync(INDEX, indexOriginal.replace(entrada, copiaDaEntrada))
  gerarLista()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.locator('[data-versao-nova]').waitFor({ timeout: 60000 })
  conferir('com o código novo publicado, a tela aberta oferece atualizar', true)
  await page.locator('[data-versao-nova]').click()
  const abriu = await page
    .locator('main')
    .getByRole('button', { name: 'Novo jogo', exact: true })
    .waitFor({ timeout: 150000 })
    .then(() => true)
    .catch(() => false)
  if (!abriu) {
    await page.screenshot({ path: path.join(AQUI, 'saidas', 'aplicativo-erro.png') })
    throw new Error(`não abriu depois de atualizar: ${erros.join(' | ')} | ${(await page.evaluate(() => document.body.innerText)).slice(0, 200)}`)
  }
  await page.waitForFunction(() => !document.body.textContent.includes('Carregando o tabuleiro'), null, { timeout: 150000, polling: 500 })
  const estiloDaPagina = await page.evaluate(() => document.querySelector('link[rel=stylesheet][href*="/assets/"]').getAttribute('href'))
  conferir('atualizar abre a versão nova e o aviso some', estiloDaPagina.endsWith('-nova.css') && (await page.locator('[data-versao-nova]').count()) === 0, estiloDaPagina)

  // =================== instalar ===================
  conferir('sem o convite do navegador, não aparece botão de instalar', (await page.locator('[data-instalar]').count()) === 0)
  await page.evaluate(() => {
    const pedido = new Event('beforeinstallprompt', { cancelable: true })
    pedido.prompt = async () => {
      window.__perguntou = true
    }
    pedido.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(pedido)
  })
  await page.locator('[data-instalar]').waitFor()
  conferir('o navegador oferece instalar: aparece o botão', true)
  await page.locator('[data-instalar]').click()
  await page.waitForFunction(() => window.__perguntou === true, null, { timeout: 10000, polling: 200 })
  await page.waitForTimeout(300)
  conferir('o botão abre a pergunta do navegador e some depois da resposta', (await page.locator('[data-instalar]').count()) === 0)
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))

  // =================== iPhone ===================
  // uma tela 3D por vez: sem placa de vídeo, duas ao mesmo tempo passam do tempo
  await contexto.close()
  // em 1x: o 3D em 3x, sem placa de vídeo, passa do tempo
  const iphone = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })
  const telaDoIphone = await iphone.newPage()
  telaDoIphone.setDefaultTimeout(150000)
  await telaDoIphone.addInitScript(configBaixa)
  const errosDoIphone = []
  telaDoIphone.on('pageerror', (e) => errosDoIphone.push(e.message.slice(0, 200)))
  await telaDoIphone.goto(SITE, { waitUntil: 'load', timeout: 150000 })
  const apareceu = await telaDoIphone
    .locator('[data-instalar]')
    .waitFor()
    .then(() => true)
    .catch(() => false)
  if (!apareceu) {
    await telaDoIphone.screenshot({ path: path.join(AQUI, 'saidas', 'aplicativo-iphone.png') })
    throw new Error(`iPhone sem botão: ${errosDoIphone.join(' | ')} | ${(await telaDoIphone.evaluate(() => document.body.innerText)).slice(0, 300)}`)
  }
  await telaDoIphone.locator('[data-instalar]').click()
  conferir('no iPhone, o botão explica o Adicionar à Tela de Início', (await telaDoIphone.getByText('Adicionar à Tela de Início').count()) === 1)
  await iphone.close()
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  // o dist volta a ser o do build
  fs.writeFileSync(LIVRO, livroOriginal)
  fs.writeFileSync(INDEX, indexDoBuild)
  if (copiaDaEntrada) fs.rmSync(path.join(DIST, copiaDaEntrada), { force: true })
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'gerar-sw.mjs')], { stdio: 'pipe' })
  await browser.close()
  servidor.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
