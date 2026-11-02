// Gera os avatares sugeridos em public/avatares a partir dos modelos das peças. Com o site de desenvolvimento
// no ar: node scripts/gerar-avatares.mjs
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = path.join(RAIZ, 'public', 'avatares')
const FOTOS = path.join(RAIZ, 'testes', 'saidas')
const SITE = process.env.SITE ?? 'http://127.0.0.1:5184/xadrez-caotico/'

fs.mkdirSync(DESTINO, { recursive: true })
fs.mkdirSync(FOTOS, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 370 } })
  page.on('pageerror', (e) => console.log('erro na página:', e.message))
  await page.goto(`${SITE}scripts/avatares/index.html`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__retratos, null, { timeout: 180000, polling: 500 })
  const retratos = await page.evaluate(() => window.__retratos)
  for (const [nome, url] of Object.entries(retratos)) {
    const bytes = Buffer.from(url.split(',')[1], 'base64')
    fs.writeFileSync(path.join(DESTINO, `${nome}.webp`), bytes)
    console.log(nome, `${(bytes.length / 1024).toFixed(1)} KB`)
  }
  await page.screenshot({ path: path.join(FOTOS, 'avatares.png'), timeout: 150000 })
} finally {
  await browser.close()
}
