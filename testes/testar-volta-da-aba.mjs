// O celular pode descartar o que a aba tem na placa de vídeo enquanto ela está em segundo plano. Aqui o
// navegador é mandado perder o contexto gráfico de propósito e recuperá-lo depois, e a tela precisa voltar a
// ser a mesma: tabuleiro, fundo e reflexos, nada preto.
// Precisa do site no ar (npm run dev). Só um navegador, com o 3D ligado: leva alguns minutos sem placa de vídeo.
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const FOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'saidas')
fs.mkdirSync(FOTOS, { recursive: true })
const SITE = process.env.SITE ?? 'http://127.0.0.1:5184/xadrez-caotico/'

let falhas = 0
function conferir(nome, ok, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage()
page.setDefaultTimeout(150000)
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
page.on('console', (m) => {
  if (m.text().includes('Context')) console.log('  navegador:', m.text().slice(0, 120))
})
await page.addInitScript(() => {
  if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', som: false, ambiente: false }))
})

/** Brilho médio da imagem na tela, de 0 a 255. O menu fica escondido pra só o tabuleiro contar. */
async function brilhoDaTela(nome) {
  const foto = await page.screenshot({ path: path.join(FOTOS, nome), timeout: 150000 })
  return page.evaluate(async (base64) => {
    const imagem = new Image()
    imagem.src = `data:image/png;base64,${base64}`
    await imagem.decode()
    const quadro = document.createElement('canvas')
    quadro.width = 80
    quadro.height = 60
    const contexto = quadro.getContext('2d', { willReadFrequently: true })
    contexto.drawImage(imagem, 0, 0, 80, 60)
    const { data } = contexto.getImageData(0, 0, 80, 60)
    let soma = 0
    for (let i = 0; i < data.length; i += 4) soma += (data[i] + data[i + 1] + data[i + 2]) / 3
    return soma / (data.length / 4)
  }, foto.toString('base64'))
}

try {
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 150000, polling: 500 })
  await page.getByRole('button', { name: 'Novo jogo', exact: true }).waitFor()
  await page.waitForTimeout(6000)
  const antes = await brilhoDaTela('aba-antes.png')

  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = canvas.getContext('webgl2')
    window.__perda = gl.getExtension('WEBGL_lose_context')
    window.__perda.loseContext()
  })
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__perda.restoreContext())
  await page.waitForTimeout(8000)
  const depois = await brilhoDaTela('aba-depois.png')

  conferir('a tela volta com o mesmo brilho de antes', Math.abs(antes - depois) < 6, `antes ${antes.toFixed(1)}, depois ${depois.toFixed(1)}`)
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
process.exit(falhas ? 1 : 0)
