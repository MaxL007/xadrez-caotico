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
/** A luta sem arma: o jab antes do direto, ou a perna no ar antes do chute, e a vítima caindo. */
const socou = ({ tocados }) => tocados.indexOf('soco:jab') >= 0 && tocados.indexOf('soco:jab') < tocados.indexOf('soco') && tocados.some((s) => s.startsWith('queda:'))
const chutou = ({ tocados }) => tocados.indexOf('chute:ar') >= 0 && tocados.indexOf('chute:ar') < tocados.indexOf('chute') && tocados.some((s) => s.startsWith('queda:'))

/** Monta a posição com a peça de quem joga vestida, captura e devolve os sons tocados e o estado do tabuleiro. */
async function capturar(nome, { pgn, vestir, de, para, promocao = null }) {
  await h('vestirParaTeste', vestir)
  await h('carregarTeste', pgn, 'w')
  await esperarParar()
  await limparSons()
  await h('jogar', de, para)
  if (promocao) {
    await page.locator('[role=dialog] button').first().waitFor({ timeout: 20000 })
    await h('escolherPromocao', promocao)
  }
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
  const macaNoCavalo = await capturar('maça no cavalo', { pgn: '1. a4 Nc6 2. a5 Nxa5', de: 'a1', para: 'a5', vestir: { r: { arma: 'maca' } } })
  conferir(
    'maça num cavalo: o cavaleiro fica preso, e o cavalo relincha e foge',
    ['maca:espinhos', 'fuga:n', 'maca:solta'].every((s) => macaNoCavalo.tocados.includes(s)) && macaNoCavalo.problemas.length === 0,
    `${macaNoCavalo.tocados.join(' ')} | ${macaNoCavalo.problemas.join('; ')}`,
  )
  conferir('numa peça que não é cavalo, nada foge', !maca.tocados.includes('fuga:n'), maca.tocados.join(' '))
  await h('forcarGolpeSemArma', 'chute')
  const torreSemArma = await capturar('torre sem arma', { ...COM_TORRE, vestir: {} })
  conferir('torre sem arma: chuta, sem marreta', chutou(torreSemArma) && !torreSemArma.tocados.includes('marreta:impacto') && torreSemArma.problemas.length === 0, `${torreSemArma.tocados.join(' ')} | ${torreSemArma.problemas.join('; ')}`)
  await h('forcarGolpeSemArma', null)

  // =================== peão ===================
  // a vítima é um cavalo: peão contra peão pode se render com honra (15%), e aí não há golpe
  const COM_PEAO = { pgn: '1. e4 Nc6 2. d4 a6 3. d5 a5', de: 'd5', para: 'c6' }
  const katana = await capturar('katana', { ...COM_PEAO, vestir: { p: { arma: 'katana' } } })
  conferir('a katana tem som ao sair da bainha', katana.tocados.includes('katana:saca') && !katana.tocados.includes('espada:saca'), katana.tocados.join(' '))
  conferir('a katana sem a habilidade equipada não retalha', !katana.tocados.includes('retalho:corte'), katana.tocados.join(' '))
  const espada = await capturar('espada', { ...COM_PEAO, vestir: { p: { arma: 'espada' } } })
  conferir('a espada tem outro som ao sair da bainha', espada.tocados.includes('espada:saca') && !espada.tocados.includes('katana:saca'), espada.tocados.join(' '))
  await h('forcarGolpeSemArma', 'socos')
  const semArma = await capturar('sem arma', { ...COM_PEAO, vestir: {} })
  conferir('sem arma, não há som de saque', !semArma.tocados.some((s) => s.endsWith(':saca')), semArma.tocados.join(' '))
  conferir('o peão sem arma luta com os punhos: um jab e o direto', socou(semArma) && semArma.problemas.length === 0, `${semArma.tocados.join(' ')} | ${semArma.problemas.join('; ')}`)
  await h('forcarGolpeSemArma', 'chute')
  const peaoChuta = await capturar('peão chuta', { ...COM_PEAO, vestir: {} })
  conferir('ou com um chute', chutou(peaoChuta) && peaoChuta.problemas.length === 0, `${peaoChuta.tocados.join(' ')} | ${peaoChuta.problemas.join('; ')}`)
  await h('forcarGolpeSemArma', null)
  const retalho = await capturar('retalhamento', { ...COM_PEAO, vestir: { p: { arma: 'katana', golpe: 'retalhamento' } } })
  conferir(
    'retalhamento equipado: vários cortes e a peça em pedaços',
    retalho.tocados.filter((s) => s === 'retalho:corte').length >= 3 && retalho.tocados.includes('retalho:pedacos') && retalho.problemas.length === 0,
    `${retalho.tocados.join(' ')} | ${retalho.problemas.join('; ')}`,
  )
  const retalhoDeEspada = await capturar('retalhamento com espada', { ...COM_PEAO, vestir: { p: { arma: 'espada', golpe: 'retalhamento' } } })
  conferir('equipado, mas com a espada na mão, não retalha', !retalhoDeEspada.tocados.includes('retalho:corte') && retalhoDeEspada.tocados.includes('espada:saca'), retalhoDeEspada.tocados.join(' '))

  // =================== bispo, rainha e rei ===================
  const COM_BISPO = { pgn: '1. e4 e5 2. Bc4 d6', de: 'c4', para: 'f7' }
  const cristal = await capturar('cristal', { ...COM_BISPO, vestir: { b: { arma: 'cristal' } } })
  conferir('cristal: convocado e quebrado na peça', cristal.tocados.includes('cristal:convoca') && cristal.tocados.includes('cristal:quebra') && cristal.problemas.length === 0, `${cristal.tocados.join(' ')} | ${cristal.problemas.join('; ')}`)
  const cajado = await capturar('cajado', { ...COM_BISPO, vestir: { b: { arma: 'cajado' } } })
  conferir('cajado: o raio', cajado.tocados.includes('raio:q') && cajado.problemas.length === 0, cajado.tocados.join(' '))
  await h('forcarGolpeSemArma', 'chute')
  const bispoSemArma = await capturar('bispo sem arma', { ...COM_BISPO, vestir: {} })
  conferir('bispo sem arma: vai até a peça e chuta, sem poder', chutou(bispoSemArma) && !bispoSemArma.tocados.includes('magia:b') && bispoSemArma.problemas.length === 0, `${bispoSemArma.tocados.join(' ')} | ${bispoSemArma.problemas.join('; ')}`)
  const COM_RAINHA = { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7' }
  await h('forcarGolpeSemArma', 'socos')
  const rainhaSemArma = await capturar('rainha sem arma', { ...COM_RAINHA, vestir: {} })
  conferir('rainha sem arma: socos, sem o raio', socou(rainhaSemArma) && !rainhaSemArma.tocados.includes('raio:q') && rainhaSemArma.problemas.length === 0, `${rainhaSemArma.tocados.join(' ')} | ${rainhaSemArma.problemas.join('; ')}`)
  const COM_REI = { pgn: '1. e4 d5 2. Ke2 dxe4 3. Ke3 a6', de: 'e3', para: 'e4' }
  await h('forcarGolpeSemArma', 'chute')
  const reiSemArma = await capturar('rei sem arma', { ...COM_REI, vestir: {} })
  conferir('rei sem arma: chute, sem a onda', chutou(reiSemArma) && !reiSemArma.tocados.includes('onda:k') && reiSemArma.problemas.length === 0, `${reiSemArma.tocados.join(' ')} | ${reiSemArma.problemas.join('; ')}`)
  await h('forcarGolpeSemArma', null)
  const lua = await capturar('lua', { ...COM_RAINHA, vestir: { q: { arma: 'lua' } } })
  conferir('lua: o tornado que arremessa a peça longe', lua.tocados.includes('tornado') && lua.problemas.length === 0, `${lua.tocados.join(' ')} | ${lua.problemas.join('; ')}`)
  const cetro = await capturar('cetro', { ...COM_REI, vestir: { k: { arma: 'cetro' } } })
  conferir('cetro: a gravidade que afunda a peça no chão', cetro.tocados.includes('gravidade') && cetro.problemas.length === 0, `${cetro.tocados.join(' ')} | ${cetro.problemas.join('; ')}`)

  // =================== cavalo ===================
  const lanca = await capturar('lança', { pgn: '1. Nc3 d5', de: 'c3', para: 'd5', vestir: { n: { arma: 'lanca' } } })
  conferir('lança: o golpe do cavaleiro com som próprio', lanca.tocados.includes('golpe:lanca') && lanca.problemas.length === 0, lanca.tocados.join(' '))

  // =================== promoção com equipamentos ===================
  // o peão captura o cavalo em g8 e promove: os equipamentos surgem e se prendem na peça nova; no cavalo, vão pro
  // peão, um cavalo chega, recebe a montaria e o peão monta
  const PROMOVE = { pgn: '1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Ng8', de: 'h7', para: 'g8' }
  const encaixes = ({ tocados }) => tocados.filter((s) => s === 'encaixe').length
  // a máquina joga logo depois e pode tomar a peça nova: o que estava à vista em g8 é anotado enquanto ela é branca
  const vigiarG8 = () =>
    page.evaluate(() => {
      window.__vistoEmG8 = ''
      window.__vigia = setInterval(() => {
        const oitava = window.__xadrez.fen().split(' ')[0].split('/')[0].replace(/\d/g, (n) => '.'.repeat(Number(n)))
        if (/[A-Z]/.test(oitava[6])) window.__vistoEmG8 = window.__xadrez.partesVisiveis('g8').join(',')
      }, 80)
    })
  const vistoEmG8 = () => page.evaluate(() => (clearInterval(window.__vigia), window.__vistoEmG8))
  await h('forcarGolpeSemArma', 'socos')
  await vigiarG8()
  const rainha = await capturar('promoção à rainha com equipamentos', { ...PROMOVE, promocao: 'q', vestir: { q: { cabeca: 'elmo', ombros: 'placas', arma: 'lua' } } })
  conferir(
    'promoção: os equipamentos surgem em volta da rainha e cada um se prende (elmo, duas placas, lua)',
    rainha.tocados.includes('equipamento:surge') && encaixes(rainha) === 4 && rainha.problemas.length === 0 && (rainha.visto = await vistoEmG8()) === 'arma,cabeca,ombros',
    `${rainha.tocados.join(' ')} | ${rainha.problemas.join('; ')} | à vista: ${rainha.visto}`,
  )
  await vigiarG8()
  const cavalo = await capturar('promoção ao cavalo com equipamentos', { ...PROMOVE, promocao: 'n', vestir: { n: { cabeca: 'elmo', sela: 'guerra', arma: 'lanca' } } })
  conferir(
    'promoção ao cavalo: o elmo e a lança vão pro peão, o cavalo chega a galope, recebe a sela e o peão monta',
    ['equipamento:surge', 'cavalo:chega', 'montar'].every((s) => cavalo.tocados.includes(s)) &&
      encaixes(cavalo) === 3 &&
      cavalo.tocados.indexOf('cavalo:chega') < cavalo.tocados.indexOf('montar') &&
      cavalo.problemas.length === 0 &&
      (cavalo.visto = await vistoEmG8()) === 'arma,cabeca,sela',
    `${cavalo.tocados.join(' ')} | ${cavalo.problemas.join('; ')} | à vista: ${cavalo.visto}`,
  )
  const cavaloSemNada = await capturar('promoção ao cavalo sem equipamento', { ...PROMOVE, promocao: 'n', vestir: {} })
  conferir(
    'sem equipamento, o cavalo chega e o peão monta do mesmo jeito',
    cavaloSemNada.tocados.includes('cavalo:chega') && cavaloSemNada.tocados.includes('montar') && encaixes(cavaloSemNada) === 0 && cavaloSemNada.problemas.length === 0,
    `${cavaloSemNada.tocados.join(' ')} | ${cavaloSemNada.problemas.join('; ')}`,
  )
  await h('forcarGolpeSemArma', null)

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
