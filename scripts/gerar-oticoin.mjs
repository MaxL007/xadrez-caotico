// Gera as imagens da óticoin em public/oticoin a partir do modelo 3D da moeda. Com o site de desenvolvimento no ar:
// node scripts/gerar-oticoin.mjs
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = path.join(RAIZ, 'public', 'oticoin')
const FOTOS = path.join(RAIZ, 'testes', 'saidas')
const SITE = process.env.SITE ?? 'http://127.0.0.1:5184/xadrez-caotico/'

fs.mkdirSync(DESTINO, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 400 } })
  page.on('pageerror', (e) => console.log('erro na página:', e.message))
  await page.goto(`${SITE}scripts/oticoin/index.html`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__oticoin, null, { timeout: 180000, polling: 500 })
  const imagens = await page.evaluate(() => window.__oticoin)
  const gravar = (nome, url) => {
    const bytes = Buffer.from(url.split(',')[1], 'base64')
    fs.writeFileSync(path.join(DESTINO, nome), bytes)
    console.log(nome, `${(bytes.length / 1024).toFixed(1)} KB`)
  }
  gravar('giro.webp', imagens.giro)
  gravar('peao.png', imagens.peao)
  gravar('rei.png', imagens.rei)
  await page.screenshot({ path: path.join(FOTOS, 'oticoin.png') })
} finally {
  await browser.close()
}
