// Fotos de cada ataque das armas com o 3D ligado, com a câmera perto da casa da captura. Ficam em testes/saidas/armas.
//
// Sem placa de vídeo cada quadro leva mais de um segundo: com o relógio de verdade, a foto sai depois que o efeito já
// acabou. Por isso o relógio da página fica parado (clock do Playwright) e só anda quando o teste manda, sem desenhar
// (__semDesenho); só o quadro da foto é desenhado. A máquina joga no fácil, porque o difícil mede o tempo de pensar
// por esse mesmo relógio e levaria minutos.
//
//   node testes/fotos-armas.mjs                 # todas
//   SO=machado,cristal node testes/fotos-armas.mjs
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const FOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'saidas', 'armas')
fs.mkdirSync(FOTOS, { recursive: true })
const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
const so = process.env.SO?.split(',')

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const contexto = await browser.newContext({ viewport: { width: 700, height: 520 } })
await contexto.clock.install()
const page = await contexto.newPage()
page.setDefaultTimeout(240000)
page.on('pageerror', (e) => console.log('ERRO:', e.message.slice(0, 200)))
await page.addInitScript(() => localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'media', qualidadeEscolhida: true, som: true, ambiente: false })))
await page.goto(SITE, { waitUntil: 'load', timeout: 240000 })
await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 240000, polling: 500 })
await page.mouse.click(5, 5)
await page.evaluate(() => (window.__semDesenho = true))
// o relógio falso pode estar à frente do de verdade depois de carregar: tenta pausar cada vez mais adiante
for (let margem = 3000; ; margem *= 2) {
  try {
    await page.clock.pauseAt(Math.max(Date.now(), await page.evaluate(() => Date.now())) + margem)
    break
  } catch (e) {
    if (margem > 400000) throw e
  }
}
const h = (fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })

/** Faz o relógio andar até a condição valer na página. */
async function andarAte(condicao, arg, maximo, oQue) {
  let decorrido = 0
  while (!(await page.evaluate(condicao, arg))) {
    await page.clock.runFor(48)
    decorrido += 48
    if (decorrido % 960 === 0) await page.waitForTimeout(30)
    if (decorrido > maximo) throw new Error(`${oQue}: não aconteceu em ${maximo} ms`)
  }
}
const livre = () => andarAte(() => !window.__xadrez.ocupado(), null, 90000, 'fim do lance')

/** `momentos`: [som, ms depois do som, arquivo]. O som fica registrado quando é pedido, mesmo que toque mais tarde. */
async function fotografar(nome, { pgn, vestir, retalhamento = false, de, para, camera, momentos }) {
  if (so && !so.includes(nome)) return
  await h('vestirParaTeste', vestir, retalhamento)
  await h('carregarTeste', pgn, 'w', 'facil')
  await livre()
  await page.clock.runFor(2500)
  await h('aproximarDaCasa', para, ...camera)
  await page.evaluate(() => (window.__sonsTocados.length = 0))
  await h('jogar', de, para)
  let antes = 0
  let somAnterior = null
  for (const [som, espera, arquivo] of momentos) {
    if (som !== somAnterior) antes = 0
    somAnterior = som
    await andarAte((som) => window.__sonsTocados.includes(som), som, 30000, `${nome}: som ${som}`)
    if (espera > antes + 17) await page.clock.runFor(espera - antes - 17)
    antes = espera
    await page.evaluate(() => (window.__semDesenho = false))
    await page.clock.runFor(17)
    await page.screenshot({ path: path.join(FOTOS, arquivo) })
    await page.evaluate(() => (window.__semDesenho = true))
    console.log('foto', arquivo)
  }
  await livre()
}

// câmera: [distância, de que lado em graus, inclinação em graus]
const TORRE = { pgn: '1. a4 h5 2. a5 h4 3. a6 bxa6', de: 'a1', para: 'a6', camera: [4.8, -60, 58] }
// a vítima do peão é um cavalo: peão contra peão tem 15% de chance da honra do samurai
const PEAO = { pgn: '1. e4 Nc6 2. d4 a6 3. d5 a5', de: 'd5', para: 'c6', camera: [4.2, -35, 58] }
const BISPO = { pgn: '1. e4 e5 2. Bc4 d6', de: 'c4', para: 'f7', camera: [4.6, -30, 50] }
try {
  await fotografar('marreta', { ...TORRE, vestir: { r: { arma: 'marreta' } }, momentos: [['marreta:impacto', 120, 'marreta.png'], ['marreta:impacto', 900, 'marreta-rachaduras.png']] })
  await fotografar('machado', { ...TORRE, vestir: { r: { arma: 'machado' } }, momentos: [['marreta:ergue', 500, 'machado-erguido.png'], ['machado:corte', 300, 'machado-corte.png'], ['machado:corte', 800, 'machado-tombando.png'], ['machado:corte', 1400, 'machado-no-chao.png']] })
  await fotografar('maca', { ...TORRE, vestir: { r: { arma: 'maca' } }, momentos: [['maca:espinhos', 400, 'maca-presa.png'], ['maca:espinhos', 1250, 'maca-sacudindo.png'], ['maca:solta', 250, 'maca-solta.png']] })
  await fotografar('retalhamento', { ...PEAO, vestir: { p: { arma: 'katana' } }, retalhamento: true, momentos: [['retalho:corte', 40, 'retalho-corte.png'], ['retalho:pedacos', 200, 'retalho-pedacos.png'], ['retalho:pedacos', 900, 'retalho-caindo.png']] })
  await fotografar('cristal', { ...BISPO, vestir: { b: { arma: 'cristal' } }, momentos: [['cristal:convoca', 300, 'cristal-convocado.png'], ['cristal:convoca', 600, 'cristal-descendo.png'], ['cristal:quebra', 60, 'cristal-quebra.png']] })
  await fotografar('cetro', { pgn: '1. e4 d5 2. Ke2 dxe4 3. Ke3 a6', de: 'e3', para: 'e4', camera: [4.6, 30, 55], vestir: { k: { arma: 'cetro' } }, momentos: [['gravidade', 500, 'cetro.png'], ['gravidade', 1500, 'cetro-afundando.png']] })
  await fotografar('lua', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', camera: [6.5, 40, 62], vestir: { q: { arma: 'lua' } }, momentos: [['tornado', 700, 'lua.png'], ['tornado', 1600, 'lua-arremesso.png']] })
  await fotografar('lanca', { pgn: '1. Nc3 d5', de: 'c3', para: 'd5', camera: [4.6, 35, 50], vestir: { n: { arma: 'lanca' } }, momentos: [['salto:n', 0, 'lanca.png']] })
} finally {
  await browser.close()
}
console.log(`fotos prontas em ${FOTOS}`)
