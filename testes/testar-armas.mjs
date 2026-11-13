// O ataque de cada arma na captura: o som de cada efeito toca e o tabuleiro termina em ordem (a vítima some, quem
// capturou fica na casa). Também os passos no ritmo dos pés e o som do saque da katana e da espada.
// Precisa do site no ar (npm run dev). O desenho 3D fica desligado; os efeitos rodam do mesmo jeito.
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

// o som precisa tocar de verdade (é como se confere qual efeito rodou): o navegador libera sem gesto
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage()
page.setDefaultTimeout(120000)
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
await page.addInitScript(() => {
  window.__semDesenho = true
  localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: true, ambiente: false }))
})
const h = (fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })
const esperarParar = async () => {
  await page.waitForTimeout(400)
  await page.waitForFunction(() => !window.__xadrez.ocupado(), null, { timeout: 120000, polling: 250 })
  await page.waitForTimeout(600)
}
const sons = () => page.evaluate(() => [...window.__sonsTocados])
const limparSons = () => page.evaluate(() => (window.__sonsTocados.length = 0))

/** Monta a posição com a peça de quem joga vestida, captura e devolve os sons tocados e o estado do tabuleiro. */
async function capturar(nome, { pgn, vestir, retalhamento = false, de, para }) {
  await h('vestirParaTeste', vestir, retalhamento)
  await h('carregarTeste', pgn, 'w')
  await esperarParar()
  await limparSons()
  await h('jogar', de, para)
  await esperarParar()
  const tocados = await sons()
  const problemas = await h('problemasDoTabuleiro')
  const pecaNaCasa = (await h('fen')).split(' ')[0]
  return { nome, tocados, problemas, pecaNaCasa }
}

try {
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  // o primeiro clique libera o som, como faria quem joga
  await page.mouse.click(5, 5)
  await page.waitForFunction(() => window.__xadrez.somLiberado?.() ?? true, null, { timeout: 10000, polling: 200 }).catch(() => {})

  // =================== torre ===================
  const COM_TORRE = { pgn: '1. a4 h5 2. a5 h4 3. a6 bxa6', de: 'a1', para: 'a6' }
  const marreta = await capturar('marreta', { ...COM_TORRE, vestir: { r: { arma: 'marreta' } } })
  conferir('marreta: a pancada com rachaduras e tremor, e o tabuleiro em ordem', marreta.tocados.includes('marreta:impacto') && marreta.problemas.length === 0, `${marreta.tocados.join(' ')} | ${marreta.problemas.join('; ')}`)
  const machado = await capturar('machado', { ...COM_TORRE, vestir: { r: { arma: 'machado' } } })
  conferir('machado: corta a peça ao meio, com som próprio', machado.tocados.includes('machado:corte') && !machado.tocados.includes('marreta:impacto') && machado.problemas.length === 0, `${machado.tocados.join(' ')} | ${machado.problemas.join('; ')}`)
  const maca = await capturar('maca', { ...COM_TORRE, vestir: { r: { arma: 'maca' } } })
  conferir(
    'maça: a peça presa nos espinhos, sacudida e solta, cada parte com som',
    ['maca:espinhos', 'maca:sacode', 'maca:solta'].every((s) => maca.tocados.includes(s)) && maca.problemas.length === 0,
    `${maca.tocados.join(' ')} | ${maca.problemas.join('; ')}`,
  )

  // =================== peão ===================
  // a vítima é um cavalo: peão contra peão pode se render com honra (15%), e aí não há golpe
  const COM_PEAO = { pgn: '1. e4 Nc6 2. d4 a6 3. d5 a5', de: 'd5', para: 'c6' }
  const katana = await capturar('katana', { ...COM_PEAO, vestir: { p: { arma: 'katana' } } })
  conferir('a katana tem som ao sair da bainha', katana.tocados.includes('katana:saca') && !katana.tocados.includes('espada:saca'), katana.tocados.join(' '))
  const espada = await capturar('espada', { ...COM_PEAO, vestir: { p: { arma: 'espada' } } })
  conferir('a espada tem outro som ao sair da bainha', espada.tocados.includes('espada:saca') && !espada.tocados.includes('katana:saca'), espada.tocados.join(' '))
  const semArma = await capturar('sem arma', { ...COM_PEAO, vestir: {} })
  conferir('sem arma, não há som de saque', !semArma.tocados.some((s) => s.endsWith(':saca')), semArma.tocados.join(' '))
  const retalho = await capturar('retalhamento', { ...COM_PEAO, vestir: { p: { arma: 'katana' } }, retalhamento: true })
  conferir(
    'retalhamento: vários cortes e a peça em pedaços',
    retalho.tocados.filter((s) => s === 'retalho:corte').length >= 3 && retalho.tocados.includes('retalho:pedacos') && retalho.problemas.length === 0,
    `${retalho.tocados.join(' ')} | ${retalho.problemas.join('; ')}`,
  )

  // =================== bispo, rainha e rei ===================
  const COM_BISPO = { pgn: '1. e4 e5 2. Bc4 d6', de: 'c4', para: 'f7' }
  const cristal = await capturar('cristal', { ...COM_BISPO, vestir: { b: { arma: 'cristal' } } })
  conferir('cristal: convocado e quebrado na peça', cristal.tocados.includes('cristal:convoca') && cristal.tocados.includes('cristal:quebra') && cristal.problemas.length === 0, `${cristal.tocados.join(' ')} | ${cristal.problemas.join('; ')}`)
  const cajado = await capturar('cajado', { ...COM_BISPO, vestir: { b: { arma: 'cajado' } } })
  conferir('cajado: o raio', cajado.tocados.includes('raio:q') && cajado.problemas.length === 0, cajado.tocados.join(' '))
  const bispoSemArma = await capturar('bispo sem arma', { ...COM_BISPO, vestir: {} })
  conferir('bispo sem arma: o orbe de sempre', bispoSemArma.tocados.includes('magia:b'), bispoSemArma.tocados.join(' '))
  const lua = await capturar('lua', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', vestir: { q: { arma: 'lua' } } })
  conferir('lua: o tornado que arremessa a peça longe', lua.tocados.includes('tornado') && lua.problemas.length === 0, `${lua.tocados.join(' ')} | ${lua.problemas.join('; ')}`)
  const cetro = await capturar('cetro', { pgn: '1. e4 d5 2. Ke2 dxe4 3. Ke3 a6', de: 'e3', para: 'e4', vestir: { k: { arma: 'cetro' } } })
  conferir('cetro: a gravidade que afunda a peça no chão', cetro.tocados.includes('gravidade') && cetro.problemas.length === 0, `${cetro.tocados.join(' ')} | ${cetro.problemas.join('; ')}`)

  // =================== cavalo ===================
  const lanca = await capturar('lança', { pgn: '1. Nc3 d5', de: 'c3', para: 'd5', vestir: { n: { arma: 'lanca' } } })
  conferir('lança: o golpe do cavaleiro com som próprio', lanca.tocados.includes('golpe:lanca') && lanca.problemas.length === 0, lanca.tocados.join(' '))

  // =================== passos ===================
  await h('vestirParaTeste', null)
  await h('carregarTeste', '', 'w')
  await esperarParar()
  await limparSons()
  await h('jogar', 'e2', 'e4')
  await esperarParar()
  const passos = (await sons()).filter((s) => s === 'passo:p').length
  conferir('o peão andando duas casas pisa no ritmo dos pés', passos >= 2 && passos <= 12, `${passos} passos`)
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
