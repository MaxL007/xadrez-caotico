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

/** `momentos`: [som, ms depois do som, arquivo]. O som fica registrado quando é pedido, mesmo que toque mais tarde; sem
 * som (null), os ms contam do lance (o caminho até a vítima, que não tem som próprio). */
/** `alvo`: a casa pra onde a câmera olha (sem ele, a da captura). */
async function fotografar(nome, { pgn, vestir, golpe = null, de, para, promocao = null, camera, alvo = null, momentos }) {
  if (so && !so.includes(nome)) return
  await h('vestirParaTeste', vestir)
  await h('forcarGolpeSemArma', golpe)
  await h('carregarTeste', pgn, 'w', 'facil')
  await livre()
  await page.clock.runFor(2500)
  // sem `camera`, fica a vista de jogo de sempre: é o enquadramento automático da luta que se vê
  if (camera) await h('aproximarDaCasa', alvo ?? para, ...camera)
  await page.evaluate(() => (window.__sonsTocados.length = 0))
  await h('jogar', de, para)
  if (promocao) {
    await andarAte(() => document.querySelector('[role=dialog] button') !== null, null, 20000, `${nome}: pergunta da promoção`)
    await h('escolherPromocao', promocao)
  }
  let antes = 0
  let somAnterior = null
  for (const [som, espera, arquivo] of momentos) {
    if (som !== somAnterior) antes = 0
    somAnterior = som
    if (som) await andarAte((som) => window.__sonsTocados.includes(som), som, 30000, `${nome}: som ${som}`)
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
  await fotografar('maca', { ...TORRE, camera: [3.6, -90, 70], vestir: { r: { arma: 'maca' } }, momentos: [['maca:espinhos', 60, 'maca-no-peito.png'], ['maca:espinhos', 700, 'maca-presa.png'], ['maca:espinhos', 1250, 'maca-sacudindo.png'], ['maca:solta', 250, 'maca-solta.png']] })
  // a maça num cavalo: o cavaleiro fica preso, e o cavalo foge pra fora do tabuleiro
  await fotografar('maca-cavalo', {
    pgn: '1. a4 Nc6 2. a5 Nxa5',
    de: 'a1',
    para: 'a5',
    camera: [5.2, -70, 62],
    vestir: { r: { arma: 'maca' } },
    momentos: [['maca:espinhos', 60, 'maca-cavalo-golpe.png'], ['maca:espinhos', 350, 'maca-cavalo-foge.png'], ['maca:espinhos', 700, 'maca-cavalo-pula.png'], ['maca:espinhos', 1300, 'maca-cavaleiro-preso.png']],
  })
  await fotografar('retalhamento', { ...PEAO, vestir: { p: { arma: 'katana', golpe: 'retalhamento' } }, momentos: [['retalho:corte', 40, 'retalho-corte.png'], ['retalho:pedacos', 200, 'retalho-pedacos.png'], ['retalho:pedacos', 900, 'retalho-caindo.png']] })
  await fotografar('cristal', { ...BISPO, vestir: { b: { arma: 'cristal' } }, momentos: [['cristal:convoca', 300, 'cristal-convocado.png'], ['cristal:convoca', 600, 'cristal-descendo.png'], ['cristal:quebra', 60, 'cristal-quebra.png']] })
  await fotografar('cetro', { pgn: '1. e4 d5 2. Ke2 dxe4 3. Ke3 a6', de: 'e3', para: 'e4', camera: [4.6, 30, 55], vestir: { k: { arma: 'cetro' } }, momentos: [['gravidade', 500, 'cetro.png'], ['gravidade', 1500, 'cetro-afundando.png']] })
  // os golpes simples, fortes de verdade, e a vítima jogada pela força (nocaute.ts): o jab que sacode, o direto que
  // arremessa, o voo e a peça estirada; o chute na barriga; e peão contra peão, que joga bem mais perto
  await fotografar('golpe', { pgn: '1. e4 e5 2. Qh5 a6', de: 'h5', para: 'e5', alvo: 'd5', golpe: 'socos', camera: [4, -30, 72], vestir: {}, momentos: [['soco:jab', 40, 'golpe-jab.png'], ['soco', 0, 'golpe-direto.png'], ['soco', 220, 'golpe-voando.png'], ['soco', 650, 'golpe-no-chao.png']] })
  await fotografar('chute-rainha', { pgn: '1. e4 e5 2. Qh5 a6', de: 'h5', para: 'e5', alvo: 'd5', golpe: 'chute', camera: [4, -30, 72], vestir: {}, momentos: [['chute:ar', 110, 'chute-rainha-perna.png'], ['chute', 0, 'chute-rainha-acerto.png'], ['chute', 220, 'chute-rainha-voando.png'], ['chute', 650, 'chute-rainha-no-chao.png']] })
  await fotografar('golpe-peao', { pgn: '1. e4 d5', de: 'e4', para: 'd5', alvo: 'd5', golpe: 'socos', camera: [3.4, -30, 72], vestir: {}, momentos: [['soco', 160, 'peao-voando.png'], ['soco', 520, 'peao-no-chao.png']] })
  // o Puxão em poses-chave (a mecânica do anime): a base de luta, o impulso, o voo, a pegada, a hélice, o alto, a pancada,
  // o quadro de impacto (em negativo), a pose depois do golpe e a peça afundando
  await fotografar('puxao', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', alvo: 'g6', camera: [4.4, -45, 62], vestir: { q: { golpe: 'puxao' } }, momentos: [['anime:brilho', 40, 'puxao-base.png'], ['anime:estala', 80, 'puxao-impulso.png'], ['puxao:arrasta', 450, 'puxao-voando.png'], ['puxao:agarra', 30, 'puxao-pegada.png'], ['puxao:gira', 60, 'puxao-helice.png'], ['puxao:gira', 200, 'puxao-helice-2.png'], ['puxao:gira', 360, 'puxao-no-alto.png'], ['puxao:gira', 510, 'puxao-pancada.png'], ['marreta:impacto', 30, 'puxao-impacto.png'], ['marreta:impacto', 300, 'puxao-depois-do-golpe.png'], ['marreta:impacto', 700, 'puxao-engolindo.png']] })
  // de lado e baixo: o voo com o peito na frente, a hélice e a pancada; de cima: a cratera com a peça deitada de costas
  await fotografar('puxao-de-lado', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', alvo: 'g6', camera: [3.6, 0, 78], vestir: { q: { golpe: 'puxao' } }, momentos: [['puxao:arrasta', 600, 'puxao-de-lado-voando.png'], ['puxao:gira', 120, 'puxao-de-lado-helice.png'], ['puxao:gira', 360, 'puxao-de-lado-no-alto.png'], ['marreta:impacto', 250, 'puxao-de-lado-golpe.png']] })
  await fotografar('puxao-de-cima', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', alvo: 'g6', camera: [3.4, -45, 22], vestir: { q: { golpe: 'puxao' } }, momentos: [['marreta:impacto', 350, 'puxao-de-cima.png']] })
  // a cratera cresce com o peso: a rainha esmagando a rainha
  await fotografar('puxao-rainha', { pgn: '1. e4 e5 2. Qh5 Qh4', de: 'h5', para: 'h4', camera: [4.4, -45, 62], vestir: { q: { golpe: 'puxao' } }, momentos: [['marreta:impacto', 350, 'puxao-cratera-rainha.png']] })
  await fotografar('lua', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', camera: [6.5, 40, 62], vestir: { q: { arma: 'lua' } }, momentos: [['tornado', 700, 'lua.png'], ['tornado', 1600, 'lua-arremesso.png']] })
  // o cavalo de lança: a galope até o alcance, a ponta no peito, a vítima presa, a lança saindo e ela desabando; e, pela
  // vista de jogo, a câmera chegando perto conforme o cavalo chega perto
  const CAVALO = { pgn: '1. Nc3 d5', de: 'c3', para: 'd5' }
  await fotografar('lanca', {
    ...CAVALO,
    camera: [4, 80, 70],
    vestir: { n: { arma: 'lanca' } },
    momentos: [[null, 500, 'lanca-galope.png'], ['golpe:lanca', 0, 'lanca-perfura.png'], ['golpe:lanca', 250, 'lanca-presa.png'], ['lanca:puxa', 80, 'lanca-puxa.png'], ['lanca:puxa', 350, 'lanca-caindo.png']],
  })
  await fotografar('enquadra-lanca', { ...CAVALO, camera: null, vestir: { n: { arma: 'lanca' } }, momentos: [[null, 250, 'enquadra-lanca-saindo.png'], [null, 700, 'enquadra-lanca-chegando.png'], ['golpe:lanca', 100, 'enquadra-lanca-perfura.png']] })
  // o cavalo sem lança: o salto, as patas no peito ainda no ar, a vítima voando pro lado do salto e no chão
  await fotografar('cavalo', {
    ...CAVALO,
    camera: [4.4, 80, 66],
    vestir: {},
    momentos: [['salto:n', 450, 'cavalo-no-ar.png'], ['golpe:n', 0, 'cavalo-patas-no-peito.png'], ['golpe:n', 220, 'cavalo-vitima-voando.png'], ['queda:p', 120, 'cavalo-vitima-no-chao.png']],
  })
  // o Empurrão Universal: as palmas recolhidas com o brilho, a bolha crescendo (o ar sugado, a vítima contra o vento),
  // as palmas saindo, o estouro no peito e a peça voando pra fora do tabuleiro
  const EMPURRAO = { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', vestir: { q: { golpe: 'empurrao' } } }
  await fotografar('empurrao', {
    ...EMPURRAO,
    camera: null,
    momentos: [
      ['anime:brilho', 30, 'empurrao-recolhe.png'],
      ['empurrao:carrega', 350, 'empurrao-carga.png'],
      ['empurrao:carrega', 800, 'empurrao-carga-cheia.png'],
      ['empurrao:solta', 50, 'empurrao-palmas.png'],
      ['empurrao:estouro', 30, 'empurrao-estouro.png'],
      ['empurrao:estouro', 450, 'empurrao-voando.png'],
      ['empurrao:estouro', 1100, 'empurrao-longe.png'],
    ],
  })
  await fotografar('empurrao-de-lado', { ...EMPURRAO, alvo: 'g6', camera: [3.4, 10, 80], momentos: [['empurrao:carrega', 700, 'empurrao-de-lado-carga.png'], ['empurrao:solta', 40, 'empurrao-de-lado-palmas.png'], ['empurrao:estouro', 60, 'empurrao-de-lado-estouro.png'], ['empurrao:estouro', 350, 'empurrao-de-lado-voando.png']] })
  // sem arma: os socos e o chute
  const DE_LADO = [3, -40, 74]
  await fotografar('socos', { ...PEAO, camera: DE_LADO, vestir: {}, golpe: 'socos', momentos: [['soco:jab', 0, 'socos-jab.png'], ['soco', 0, 'socos-direto.png'], ['soco', 350, 'socos-queda.png']] })
  await fotografar('chute', { ...PEAO, camera: DE_LADO, vestir: {}, golpe: 'chute', momentos: [['chute:ar', 0, 'chute-camara.png'], ['chute', 0, 'chute-acerto.png'], ['chute', 350, 'chute-queda.png']] })
  await fotografar('chute-torre', { ...TORRE, camera: [3.4, -90, 74], vestir: {}, golpe: 'chute', momentos: [['chute', 0, 'chute-torre.png']] })
  await fotografar('socos-rainha', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', camera: [3.4, 100, 74], vestir: {}, golpe: 'socos', momentos: [['soco', 0, 'socos-rainha.png']] })
  // a promoção com equipamentos: eles surgem em volta da peça nova e se prendem nela; no cavalo, o peão recebe o do
  // cavaleiro, um cavalo chega a galope, recebe a montaria e o peão monta
  const PROMOCAO = { pgn: '1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Ng8', de: 'h7', para: 'g8', golpe: 'socos' }
  await fotografar('promocao-rainha', {
    ...PROMOCAO,
    promocao: 'q',
    camera: [3.6, -35, 62],
    vestir: { q: { cabeca: 'elmo', ombros: 'espinhos', maos: 'garras', arma: 'lua' } },
    momentos: [['equipamento:surge', 350, 'promocao-rainha-surgem.png'], ['encaixe', 0, 'promocao-rainha-encaixe.png'], ['encaixe', 900, 'promocao-rainha-vestida.png']],
  })
  // a Dempsey Roll (peão com os punhos): a guarda com o brilho, os ganchos, o oito, a parada, a carga e o golpe final
  // a Dempsey Roll com o enquadramento automático: a guarda, o aquecimento no ∞ (a vítima com medo), o começo dos
  // ganchos, a vítima tonta, o golpe final e ela voando
  const DEMPSEY = ['anime:brilho', 30, 'dempsey-guarda.png']
  await fotografar('dempsey', {
    ...PEAO,
    camera: null,
    vestir: { p: { golpe: 'dempsey' } },
    momentos: [
      DEMPSEY,
      ['dempsey:balanco', 350, 'dempsey-aquecimento.png'],
      ['dempsey:balanco', 1100, 'dempsey-aquecimento-2.png'],
      ['dempsey:gancho', 0, 'dempsey-gancho-1.png'],
      ['dempsey:gancho', 900, 'dempsey-tonta.png'],
      ['dempsey:final', 0, 'dempsey-final.png'],
      ['dempsey:final', 300, 'dempsey-voando.png'],
      ['dempsey:final', 800, 'dempsey-no-chao.png'],
    ],
  })
  // o gancho na cabeça: o impacto (anel, riscos, respingos) e a cabeça jogada pra trás
  await fotografar('dempsey-de-lado', { ...PEAO, camera: [3, 50, 78], vestir: { p: { golpe: 'dempsey' } }, momentos: [['dempsey:balanco', 600, 'dempsey-de-lado-aquecimento.png'], ['dempsey:gancho', 30, 'dempsey-de-lado-impacto.png'], ['dempsey:gancho', 120, 'dempsey-de-lado-gancho.png'], ['dempsey:gancho', 700, 'dempsey-de-lado-oito.png']] })
  // o enquadramento automático da luta, da vista de jogo de sempre (sem câmera posta à mão): o golpe inteiro tem de
  // aparecer, mesmo do outro lado do tabuleiro e no meio das outras peças
  await fotografar('enquadra-puxao', { pgn: '1. e4 e5 2. Qh5 Nc6', de: 'h5', para: 'f7', camera: null, vestir: { q: { golpe: 'puxao' } }, momentos: [['puxao:arrasta', 120, 'enquadra-puxao-resiste.png'], ['puxao:gira', 200, 'enquadra-puxao-helice.png'], ['marreta:impacto', 300, 'enquadra-puxao-cratera.png']] })
  await fotografar('enquadra-retalho', { ...PEAO, camera: null, vestir: { p: { arma: 'katana', golpe: 'retalhamento' } }, momentos: [['retalho:corte', 60, 'enquadra-retalho-corte.png'], ['retalho:pedacos', 200, 'enquadra-retalho-pedacos.png']] })
  await fotografar('enquadra-torre', { ...TORRE, camera: null, golpe: 'socos', vestir: {}, momentos: [['soco', 0, 'enquadra-torre-soco.png'], ['soco', 300, 'enquadra-torre-voando.png']] })
  await fotografar('enquadra-bispo', { ...BISPO, camera: null, vestir: { b: { arma: 'cajado' } }, momentos: [['raio:q', 250, 'enquadra-bispo-raio.png']] })
  // a ascensão com o foco: começa de longe (como na partida) e a câmera fecha na peça, que vira de frente pra ela
  await fotografar('ascensao', {
    ...PROMOCAO,
    promocao: 'q',
    camera: [9, -15, 50],
    alvo: 'e5',
    vestir: { q: { cabeca: 'elmo', ombros: 'espinhos', maos: 'garras', arma: 'lua' } },
    momentos: [['promocao', 1000, 'ascensao-subindo.png'], ['equipamento:surge', 120, 'ascensao-de-frente.png'], ['encaixe', 0, 'ascensao-encaixe.png'], ['ascensao:pose', 60, 'ascensao-pose.png'], ['ascensao:pose', 1700, 'ascensao-volta.png']],
  })
  await fotografar('promocao-cavalo', {
    ...PROMOCAO,
    promocao: 'n',
    camera: [5.4, -30, 56],
    vestir: { n: { cabeca: 'elmo', ombros: 'placas', peito: 'brasao', arma: 'lanca', cavalo: 'armadura', sela: 'guerra', cabresto: 'guerra' } },
    momentos: [
      ['equipamento:surge', 350, 'promocao-cavalo-surgem.png'],
      ['cavalo:chega', 700, 'promocao-cavalo-chegando.png'],
      ['cavalo:chega', 1700, 'promocao-cavalo-parou.png'],
      ['montar', 0, 'promocao-cavalo-estribo.png'],
      ['montar', 450, 'promocao-cavalo-perna.png'],
      ['montar', 1000, 'promocao-cavalo-sentado.png'],
      ['montar', 2600, 'promocao-cavalo-montado.png'],
    ],
  })
  // a montaria de perto, do lado em que o peão sobe
  await fotografar('promocao-montar', {
    ...PROMOCAO,
    promocao: 'n',
    camera: [2.4, 80, 72],
    vestir: { n: { cabeca: 'elmo', sela: 'guerra' } },
    momentos: [
      ['montar', -50, 'montar-1-estribo.png'],
      ['montar', 300, 'montar-2-impulso.png'],
      ['montar', 600, 'montar-3-perna.png'],
      ['montar', 900, 'montar-4-sentando.png'],
      ['montar', 1300, 'montar-5-sentado.png'],
    ],
  })
} finally {
  await browser.close()
}
console.log(`fotos prontas em ${FOTOS}`)
