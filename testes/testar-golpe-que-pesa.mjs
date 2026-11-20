// "O golpe que pesa" e o cadastro das habilidades. Na captura:
// - a câmera chega perto da luta e volta;
// - a borda escurece;
// - o ambiente abaixa;
// - o golpe congela um instante no impacto, com o grunhido de quem bate e o gemido de quem apanha.
// No xeque do rei de quem joga, a borda fica vermelha e o ambiente abaixa. Na blitz, o coração bate abaixo de 20 s e o
// tique sobe nos últimos 10. Com "Menos movimento", a câmera fica parada. E toda habilidade do catálogo tem cadastro,
// animação, símbolo, preço e textos.
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

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const erros = []

async function abrir(config = {}) {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage()
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
  await page.addInitScript((extra) => {
    window.__semDesenho = true
    localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: true, ambiente: true, ...extra }))
  }, config)
  await page.goto(SITE, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { polling: 300 })
  // o primeiro clique libera o som, como faria quem joga
  await page.mouse.click(5, 5)
  return page
}

const h = (page, fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })
const esperarParar = async (page) => {
  await page.waitForTimeout(400)
  await page.waitForFunction(() => !window.__xadrez.ocupado(), null, { timeout: 120000, polling: 250 })
  await page.waitForTimeout(600)
}

/** Captura e acompanha, a cada 100 ms, a câmera, a borda e o som até o lance acabar. */
async function capturarObservando(page, { pgn, de, para }) {
  await h(page, 'vestirParaTeste', {})
  await h(page, 'forcarGolpeSemArma', 'socos')
  await h(page, 'carregarTeste', pgn, 'w', 'facil')
  await esperarParar(page)
  await page.waitForTimeout(1500)
  await page.evaluate(() => (window.__sonsTocados.length = 0))
  const antes = { camera: (await h(page, 'camera')).distancia, golpe: await h(page, 'golpeQuePesa') }
  await h(page, 'jogar', de, para)
  const visto = { menorDistancia: antes.camera, vinheta: new Set(), abafou: false }
  // até a captura acabar (a máquina responde depois: o acompanhamento para quando a vez volta pra quem joga)
  for (let i = 0; i < 200; i++) {
    const agora = await page.evaluate(() => ({
      distancia: window.__xadrez.camera().distancia,
      vinheta: document.querySelector('[data-vinheta]')?.getAttribute('data-vinheta') ?? '',
      clima: window.__xadrez.golpeQuePesa(),
      vezDaMaquina: window.__xadrez.vezDaMaquina(),
    }))
    visto.menorDistancia = Math.min(visto.menorDistancia, agora.distancia)
    if (agora.vinheta) visto.vinheta.add(agora.vinheta)
    if (agora.clima.abafado) visto.abafou = true
    if (agora.vezDaMaquina) break
    await page.waitForTimeout(100)
  }
  await esperarParar(page)
  const depois = { camera: (await h(page, 'camera')).distancia, golpe: await h(page, 'golpeQuePesa'), vinheta: await page.locator('[data-vinheta]').getAttribute('data-vinheta') }
  const tocados = await page.evaluate(() => [...window.__sonsTocados])
  return { antes, visto, depois, tocados }
}

// a rainha, sem arma, toma o peão de f7 com socos
const RAINHA_TOMA_PEAO = { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7' }

try {
  const page = await abrir()

  // =================== as habilidades do catálogo estão completas ===================
  const faltas = await h(page, 'habilidadesIncompletas')
  conferir('toda habilidade do catálogo tem cadastro, animação, símbolo, preço e textos', faltas.length === 0, faltas.join(' | '))

  // =================== a captura ===================
  const luta = await capturarObservando(page, RAINHA_TOMA_PEAO)
  conferir('a câmera chega perto da luta', luta.visto.menorDistancia < luta.antes.camera * 0.97, `${luta.antes.camera.toFixed(2)} → ${luta.visto.menorDistancia.toFixed(2)}`)
  conferir('e volta pra onde estava', Math.abs(luta.depois.camera - luta.antes.camera) < luta.antes.camera * 0.02, `${luta.antes.camera.toFixed(2)} → ${luta.depois.camera.toFixed(2)}`)
  conferir('a borda escurece durante a luta e some depois', luta.visto.vinheta.has('luta') && luta.depois.vinheta !== 'luta', [...luta.visto.vinheta].join(','))
  conferir('o ambiente abaixa na luta e volta', luta.visto.abafou && !luta.depois.golpe.abafado)
  conferir('o golpe congela no impacto', luta.depois.golpe.congelamentos > luta.antes.golpe.congelamentos, `${luta.antes.golpe.congelamentos} → ${luta.depois.golpe.congelamentos}`)
  conferir('quem bate grunhe e quem apanha geme', luta.tocados.includes('voz:q') && luta.tocados.includes('dor:p'), luta.tocados.join(' '))
  conferir('o tom dos golpes volta ao normal no fim', luta.depois.golpe.tomDosGolpes === 1)

  // =================== xeque no rei de quem joga ===================
  await h(page, 'carregarTeste', '1. e4 e5 2. f3 Qh4+', 'w', 'facil')
  await page.locator('[data-vinheta="xeque"]').waitFor({ timeout: 15000 })
  conferir('xeque no seu rei: a borda fica vermelha', true)
  conferir('e o ambiente abaixa', (await h(page, 'golpeQuePesa')).abafado)
  await h(page, 'jogar', 'g2', 'g3')
  await page.waitForFunction(() => document.querySelector('[data-vinheta]')?.getAttribute('data-vinheta') !== 'xeque', null, { timeout: 15000, polling: 200 })
  conferir('saindo do xeque, a borda some', true)
  await esperarParar(page)

  // =================== blitz: o coração e o tique ===================
  await h(page, 'carregarTeste', '1. e4 e5', 'w', 'facil', '3+2')
  await esperarParar(page)
  await page.evaluate(() => (window.__sonsTocados.length = 0))
  await h(page, 'ajustarRelogio', 'w', 15_000)
  await page.waitForTimeout(2200)
  const comPoucoTempo = await page.evaluate(() => [...window.__sonsTocados])
  conferir('abaixo de 20 s, o coração bate', comPoucoTempo.includes('coracao') && !comPoucoTempo.includes('tique'), comPoucoTempo.join(' '))
  await h(page, 'ajustarRelogio', 'w', 8_000)
  await page.waitForTimeout(2600)
  const quaseNoFim = await page.evaluate(() => [...window.__sonsTocados])
  conferir('nos últimos 10 s, o tique do relógio', quaseNoFim.filter((s) => s === 'tique').length >= 2, quaseNoFim.join(' '))
  await h(page, 'carregarTeste', '1. e4 e5', 'w', 'facil')
  await page.context().close()

  // =================== menos movimento ===================
  const calma = await abrir({ menosMovimento: true })
  const semMovimento = await capturarObservando(calma, RAINHA_TOMA_PEAO)
  conferir('com menos movimento, a câmera fica onde está', semMovimento.visto.menorDistancia >= semMovimento.antes.camera * 0.995, `${semMovimento.antes.camera.toFixed(2)} → ${semMovimento.visto.menorDistancia.toFixed(2)}`)
  conferir('mas o golpe ainda congela no impacto', semMovimento.depois.golpe.congelamentos > semMovimento.antes.golpe.congelamentos)
  await calma.context().close()

  conferir('nenhum erro na página', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `\n${falhas} conferência(s) falharam` : '\ntudo certo')
process.exit(falhas ? 1 : 0)
