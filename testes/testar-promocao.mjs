// Promoção à escolha, marreta da torre e tabuleiro virando pro lado de quem joga.
// Precisa do site no ar (npm run dev). O desenho 3D fica desligado: aqui importa a lógica das peças.
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const PRINTS = path.join(AQUI, 'saidas')
fs.mkdirSync(PRINTS, { recursive: true })
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
page.setDefaultTimeout(120000)
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
await page.addInitScript(() => {
  window.__semDesenho = true
  if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', som: false, ambiente: false }))
})
const servidor = { kill() {} }
const foto = async () => {}

const caixa = page.getByRole('dialog', { name: 'Escolher a peça da promoção' })

try {
  await page.goto('http://127.0.0.1:5184/xadrez-caotico/', { waitUntil: 'load', timeout: 90000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 90000 })
  await page.getByRole('button', { name: 'Novo jogo', exact: true }).waitFor({ timeout: 90000 })
  await page.waitForTimeout(1500)
  const h = (fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })
  const esperarParar = async (ms = 120000) => {
    for (let t = 0; t < ms; t += 250) {
      if (!(await h('ocupado'))) break
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(500)
  }
  const pecaEm = async (casa) => {
    const fen = (await h('fen')).split(' ')[0]
    const linhas = fen.split('/')
    const linha = linhas[8 - Number(casa[1])]
    let coluna = 0
    for (const c of linha) {
      if (/\d/.test(c)) coluna += Number(c)
      else {
        if (coluna === casa.charCodeAt(0) - 97) return c
        coluna++
      }
    }
    return null
  }

  // ===================== 1. promoção =====================
  const COM_PEAO_EM_H7 = '1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Ng8'
  await h('carregarTeste', COM_PEAO_EM_H7, 'w')
  await esperarParar()
  await h('jogar', 'h7', 'g8')
  await caixa.waitFor({ timeout: 15000 })
  conferir('o peão chega ao outro lado: pergunta a peça', true)
  const nomes = await caixa.getByRole('button').allInnerTexts()
  conferir('as quatro opções', ['Rainha', 'Torre', 'Bispo', 'Cavalo'].every((n) => nomes.some((t) => t.includes(n))), nomes.join(' | ').replace(/\n/g, ' '))
  conferir('o lance ainda não saiu', (await pecaEm('h7')) === 'P' && (await h('fen')).split(' ')[1] === 'w')
  await foto('xadrez-promocao.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  conferir('Esc volta: o peão fica onde está e a vez continua', (await caixa.count()) === 0 && (await pecaEm('h7')) === 'P' && (await h('fen')).split(' ')[1] === 'w')

  for (const [nome, letra] of [['Torre', 'R'], ['Bispo', 'B'], ['Cavalo', 'N'], ['Rainha', 'Q']]) {
    await h('carregarTeste', COM_PEAO_EM_H7, 'w')
    await esperarParar()
    await h('jogar', 'h7', 'g8')
    await caixa.getByRole('button', { name: nome }).click()
    await page.waitForTimeout(400)
    conferir(`escolher ${nome}: vira ${nome}`, (await pecaEm('g8')) === letra, await pecaEm('g8'))
    await esperarParar()
    conferir(`${nome}: tabuleiro em ordem depois da ascensão`, (await h('problemasDoTabuleiro')).length === 0)
  }

  await h('carregarTeste', '1. a4 h5 2. a5 h4 3. a6 h3 4. axb7 hxg2 5. Ra3', 'b')
  await esperarParar()
  await h('jogar', 'g2', 'h1')
  await caixa.waitFor({ timeout: 15000 })
  conferir('de pretas também pergunta, com as peças pretas', (await caixa.innerText()).includes('♞'))
  await caixa.getByRole('button', { name: 'Cavalo' }).click()
  await page.waitForTimeout(400)
  conferir('promoção das pretas', (await pecaEm('h1')) === 'n', await pecaEm('h1'))
  await esperarParar()

  await h('carregarTeste', COM_PEAO_EM_H7, 'w')
  await esperarParar()
  await h('jogar', 'h7', 'g8')
  await caixa.waitFor({ timeout: 15000 })
  await h('carregarTeste', '', 'w')
  await page.waitForTimeout(500)
  conferir('outro jogo no meio da escolha: a pergunta some', (await caixa.count()) === 0)
  await esperarParar()

  // ===================== 2. marreta =====================
  const COM_TORRE = '1. a4 h5 2. a5 h4 3. a6 bxa6'
  await h('carregarTeste', COM_TORRE, 'w')
  await esperarParar()
  await page.locator('canvas').first().scrollIntoViewIfNeeded()
  await h('jogar', 'a1', 'a6')
  for (let t = 0; t < 90000 && !(await h('marretadas')); t += 100) await page.waitForTimeout(100)
  conferir('a torre vai até a vítima e a marreta aparece', (await h('marretadas')) === 1)
  for (let t = 0; t < 30000 && (await h('marretadas')); t += 100) await page.waitForTimeout(100)
  conferir('a marreta some depois do golpe', (await h('marretadas')) === 0)
  await esperarParar()
  conferir('a captura aconteceu', (await pecaEm('a6')) !== null)
  conferir('tabuleiro em ordem depois da marretada', (await h('problemasDoTabuleiro')).length === 0, (await h('problemasDoTabuleiro')).join('; '))

  // vizinha: já está no alcance, nem precisa andar
  await h('carregarTeste', '1. h4 g5 2. Rh3 g4 3. Rg3 h5', 'w')
  await esperarParar()
  await h('jogar', 'g3', 'g4')
  await esperarParar()
  conferir('torre capturando a peça vizinha: em ordem', (await h('problemasDoTabuleiro')).length === 0 && (await pecaEm('g3')) === null)

  // outro jogo no meio do golpe: a marreta não fica na mão de ninguém
  await h('carregarTeste', COM_TORRE, 'w')
  await esperarParar()
  await h('jogar', 'a1', 'a6')
  for (let t = 0; t < 90000 && !(await h('marretadas')); t += 100) await page.waitForTimeout(100)
  await h('carregarTeste', '', 'w')
  // a marreta sai no quadro seguinte, e sem placa de vídeo o quadro depois de trocar as peças demora
  const trocou = Date.now()
  for (let t = 0; t < 90000 && (await h('marretadas')); t += 100) await page.waitForTimeout(100)
  const demorou = Date.now() - trocou
  await page.waitForTimeout(1500)
  await esperarParar()
  const sobrou = await h('problemasDoTabuleiro')
  conferir('outro jogo no meio do golpe: nada fica pela metade', (await h('marretadas')) === 0 && sobrou.length === 0, `marretadas ${await h('marretadas')} (saiu em ${demorou} ms); ${sobrou.join('; ')}`)

  // ===================== 3. o tabuleiro gira pro lado de quem joga =====================
  const pararDeGirar = async () => {
    for (let t = 0; t < 30000 && (await h('camera')).girando; t += 100) await page.waitForTimeout(100)
    await page.waitForTimeout(300)
  }
  await h('carregarTeste', '', 'w')
  await pararDeGirar()
  await esperarParar()
  conferir('de brancas: as brancas perto da tela', (await h('camera')).z > 0, String((await h('camera')).z))
  await h('carregarTeste', '1. e4', 'b')
  await page.waitForTimeout(300)
  conferir('escolheu pretas: o tabuleiro gira', (await h('camera')).girando)
  await pararDeGirar()
  await esperarParar()
  const deLado = await h('camera')
  conferir('de pretas: as pretas perto da tela', deLado.z < 0, String(deLado.z))
  conferir('as coordenadas vão pro lado de quem joga', deLado.coordenadaA < 0, String(deLado.coordenadaA))
  conferir('peças no lugar vistas do outro lado', (await h('problemasDoTabuleiro')).length === 0, (await h('problemasDoTabuleiro')).join('; '))
  await foto('tabuleiro-de-pretas.png')
  // com o tabuleiro virado, o clique continua caindo na casa certa
  const de = await h('casaNaTela', 'e7')
  const para = await h('casaNaTela', 'e5')
  await page.mouse.click(de.x, de.y)
  await page.waitForTimeout(600)
  await page.mouse.click(para.x, para.y)
  await page.waitForTimeout(800)
  conferir('jogando de pretas com o mouse: e7-e5', (await pecaEm('e5')) === 'p' && (await pecaEm('e7')) === null, (await h('fen')).split(' ')[0])
  await esperarParar()
  await h('carregarTeste', '', 'w')
  await pararDeGirar()
  await esperarParar()
  conferir('voltando pras brancas, gira de volta', (await h('camera')).z > 0 && (await h('camera')).coordenadaA > 0)

  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
  await foto('xadrez-promocao-erro.png')
} finally {
  await browser.close()
  servidor.kill()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
