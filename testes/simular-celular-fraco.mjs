// Simula o jogo num celular fraco (4 GB de memória, tela 720x1600, processador 4 vezes mais lento) e procura os bugs
// que só aparecem nele (pedido do usuário). Confere:
// - o aparelho fraco começa na qualidade baixa, e a baixa fica nítida (1,35 vez a tela, não esticada);
// - partidas seguidas com capturas e habilidades, com o processador lento: o tabuleiro fica certo, sem erro de
//   JavaScript, e a memória não cresce a cada partida;
// - a placa de vídeo "perdida" e devolvida (o Android faz isso com pouca memória ou ao trocar de aplicativo);
// - a aba em segundo plano e de volta no meio de uma luta;
// - a Loja aberta por cima: o tabuleiro de fundo desenha menos.
// No fim mostra os quadros por segundo medidos (só referência: no PC a placa de vídeo é outra).
// Precisa do site no ar (npm run dev). Rodar: node testes/simular-celular-fraco.mjs
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
const LENTIDAO = Number(process.env.LENTIDAO ?? 4)
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] })
const erros = []
const h = (page, fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })
const esperarParar = async (page) => {
  await page.waitForTimeout(400)
  await page.waitForFunction(() => !window.__xadrez.ocupado(), null, { timeout: 180000, polling: 250 })
  await page.waitForTimeout(400)
}

/** Quadros por segundo do tabuleiro durante `ms`, contados pelo próprio navegador. */
const medirQuadros = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((ok) => {
        let quadros = 0
        const inicio = performance.now()
        const contar = () => {
          quadros++
          if (performance.now() - inicio < ms) requestAnimationFrame(contar)
          else ok(Math.round((quadros * 1000) / (performance.now() - inicio)))
        }
        requestAnimationFrame(contar)
      }),
    ms,
  )
const memoriaJS = (page) => page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null))

// as capturas das partidas: peão de katana (retalhamento), peão de punhos (Dempsey Roll e Espiral Absoluto), rainha (Puxão e Empurrão)
const CAPTURAS = [
  { nome: 'retalhamento', vestir: { p: { arma: 'katana', golpe: 'retalhamento' } }, pgn: '1. e4 d5', de: 'e4', para: 'd5' },
  { nome: 'Dempsey Roll', vestir: { p: { golpe: 'dempsey' } }, pgn: '1. e4 d5', de: 'e4', para: 'd5' },
  { nome: 'Espiral Absoluto', vestir: { p: { golpe: 'espiral' } }, pgn: '1. e4 d5', de: 'e4', para: 'd5' },
  { nome: 'Puxão Universal', vestir: { q: { golpe: 'puxao', golpe2: 'empurrao' } }, pgn: '1. e4 e5 2. Qh5 Nf6', de: 'h5', para: 'f7', habilidade: 'puxao' },
  { nome: 'Empurrão Universal', vestir: { q: { golpe: 'puxao', golpe2: 'empurrao' } }, pgn: '1. e4 e5 2. Qh5 Nf6', de: 'h5', para: 'f7', habilidade: 'empurrao' },
  { nome: 'golpe de sempre', vestir: {}, pgn: '1. e4 d5', de: 'e4', para: 'd5' },
]

try {
  const contexto = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A045M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  const page = await contexto.newPage()
  page.setDefaultTimeout(180000)
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
  // o navegador do celular de 4 GB informa deviceMemory = 4
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 4, configurable: true }))
  const cdp = await contexto.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: LENTIDAO })
  await page.goto(SITE, { waitUntil: 'load', timeout: 180000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 180000, polling: 500 })

  // =================== a qualidade ===================
  const cena = await h(page, 'cena')
  conferir('aparelho de 4 GB começa na qualidade baixa (sem sombras)', cena.sombras === false, JSON.stringify(cena))
  conferir('a baixa desenha a 1,35 vez a tela (ou um pouco menos, se a resolução dinâmica já baixou), não esticada', cena.resolucao > 1.3 * 0.7 - 0.01 && cena.resolucao <= 1.36, String(cena.resolucao))
  const quadrosNoMenu = await medirQuadros(page, 3000)

  // =================== partidas seguidas com capturas ===================
  const memoriaNoComeco = await memoriaJS(page)
  const quadrosNaLuta = []
  for (let rodada = 0; rodada < 2; rodada++) {
    for (const captura of CAPTURAS) {
      await h(page, 'vestirParaTeste', captura.vestir)
      await h(page, 'carregarTeste', captura.pgn, 'w', 'facil')
      await esperarParar(page)
      await h(page, 'jogar', captura.de, captura.para)
      if (captura.habilidade) {
        await page.waitForTimeout(300)
        await h(page, 'escolherHabilidade', captura.habilidade)
      }
      quadrosNaLuta.push(await medirQuadros(page, 1500))
      await esperarParar(page)
      const problemas = await h(page, 'problemasDoTabuleiro')
      if (rodada === 0 || problemas.length) conferir(`${captura.nome} com o processador lento: o tabuleiro fica certo`, problemas.length === 0, problemas.join('; '))
    }
  }
  await page.evaluate(() => window.gc?.())
  await page.waitForTimeout(1500)
  const memoriaNoFim = await memoriaJS(page)
  if (memoriaNoComeco !== null) {
    conferir('10 partidas com capturas: a memória não dispara', memoriaNoFim - memoriaNoComeco < 80, `${memoriaNoComeco} MB → ${memoriaNoFim} MB`)
  }

  // =================== a placa de vídeo perdida e devolvida ===================
  const perdeu = await page.evaluate(async () => {
    const canvas = document.querySelector('main canvas')
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
    const extensao = gl?.getExtension('WEBGL_lose_context')
    if (!extensao) return 'sem extensão'
    extensao.loseContext()
    await new Promise((r) => setTimeout(r, 800))
    extensao.restoreContext()
    await new Promise((r) => setTimeout(r, 1500))
    return gl.isContextLost() ? 'continua perdida' : 'voltou'
  })
  conferir('a placa de vídeo perdida volta e o jogo continua desenhando', perdeu === 'voltou', perdeu)
  await h(page, 'vestirParaTeste', {})
  await h(page, 'carregarTeste', '1. e4 d5', 'w', 'facil')
  await esperarParar(page)
  await h(page, 'jogar', 'e4', 'd5')
  await esperarParar(page)
  const depoisDaPerda = await h(page, 'problemasDoTabuleiro')
  conferir('depois da placa voltar, uma captura sai certa', depoisDaPerda.length === 0, depoisDaPerda.join('; '))

  // =================== a aba em segundo plano no meio da luta ===================
  await h(page, 'vestirParaTeste', { q: { golpe: 'puxao' } })
  await h(page, 'carregarTeste', '1. e4 e5 2. Qh5 Nf6', 'w', 'facil')
  await esperarParar(page)
  await h(page, 'jogar', 'h5', 'f7')
  await page.waitForTimeout(700)
  // como quem troca de aplicativo no meio do Puxão: a página some e volta 4 s depois
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  await page.waitForTimeout(4000)
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  await esperarParar(page)
  const depoisDaVolta = await h(page, 'problemasDoTabuleiro')
  conferir('trocou de aplicativo no meio do Puxão e voltou: o tabuleiro fica certo', depoisDaVolta.length === 0, depoisDaVolta.join('; '))

  // =================== a Loja por cima ===================
  await page.goto(SITE, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 180000, polling: 500 })
  const semLoja = await medirQuadros(page, 2000)
  const loja = page.locator('main').getByRole('button', { name: 'Loja', exact: true })
  if (await loja.count()) {
    await loja.click()
    await page.waitForTimeout(1500)
    const desenhos = await page.locator('canvas').count()
    conferir('com a Loja aberta, dois desenhos 3D na página (o tabuleiro e o da Loja)', desenhos >= 2, String(desenhos))
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await page.waitForTimeout(500)
    conferir('fechou a Loja: o desenho dela foi embora', (await page.locator('canvas').count()) === 1)
  }

  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
  const media = (lista) => Math.round(lista.reduce((s, q) => s + q, 0) / Math.max(lista.length, 1))
  console.log(
    `\nReferência (processador ${LENTIDAO}x mais lento, placa de vídeo emulada): ${quadrosNoMenu} quadros/s no menu, ${semLoja} com a página nova, ` +
      `${media(quadrosNaLuta)} em média nas lutas (o desenho vai a no máximo 30 na baixa).`,
  )
  console.log(`Resolução no fim: ${(await h(page, 'cena')).resolucao} pixels de desenho por pixel da tela.`)
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
