// Tira as fotos das telas novas, com o 3D ligado, um navegador de cada vez (sem placa de vídeo, dois
// ao mesmo tempo travam). O amigo das fotos é uma conta criada direto no servidor. As fotos ficam em
// testes/saidas.
import crypto from 'crypto'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const FOTOS = path.join(AQUI, 'saidas')
fs.mkdirSync(FOTOS, { recursive: true })
const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
const API = process.env.API ?? 'http://127.0.0.1:8787'

async function api(metodo, caminho, token, corpo) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { Origin: 'http://127.0.0.1:5184', ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  return r.json()
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const sufixo = Date.now().toString(36).slice(-5)

async function sessao(viewport, nomeDaConta, passos) {
  const contexto = await browser.newContext({ viewport })
  const page = await contexto.newPage()
  page.setDefaultTimeout(150000)
  await page.addInitScript(() => {
    if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', som: false, ambiente: false }))
  })
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 150000, polling: 500 })
  await page.getByRole('button', { name: 'Novo jogo', exact: true }).waitFor()
  await page.waitForTimeout(3000)
  const foto = async (nome) => {
    await page.screenshot({ path: path.join(FOTOS, nome), timeout: 150000 }).catch((e) => console.log(`sem foto ${nome}: ${e.message.split('\n')[0]}`))
    console.log('foto', nome)
  }
  await passos(page, foto)
  await contexto.close()
}

const botao = (page, nome) => page.locator('main').getByRole('button', { name: nome, exact: true })

try {
  await sessao({ width: 1280, height: 860 }, 'computador', async (page, foto) => {
    await foto('tela-menu-computador.png')
    await botao(page, 'Entrar').click()
    await foto('tela-conta-computador.png')
    await page.getByRole('button', { name: 'Criar uma conta' }).click()
    await page.getByLabel('Nome de jogador').fill(`Foto ${sufixo}`)
    await page.getByLabel('Senha', { exact: true }).fill('senha-da-foto')
    await page.getByLabel('Repita a senha').fill('senha-da-foto')
    await botao(page, 'Criar conta').click()
    await page.locator('[data-codigo-recuperacao]').waitFor()
    await foto('tela-codigo-computador.png')
    await botao(page, 'Já guardei').click()
    await page.locator('main').getByRole('button', { name: /^Amigos/ }).click()
    await foto('tela-amigos-vazia-computador.png')

    const nomeAmigo = `Amigo ${sufixo}`
    const chave = crypto.pbkdf2Sync('senha-da-foto', `xadrez-caotico:v1:${nomeAmigo.toLowerCase()}`, 1000, 32, 'sha256').toString('base64')
    const amigo = await api('POST', '/contas', null, { nome: nomeAmigo, chave })
    await api('POST', '/amigos', amigo.token, { busca: `Foto ${sufixo}` })
    await page.getByText('Convites de amizade').waitFor()
    await page.waitForTimeout(1500)
    await foto('tela-amigos-convite-computador.png')
    await botao(page, 'Aceitar').click()
    await page.locator('[data-amigo]').waitFor()
    await page.waitForTimeout(1500)
    await foto('tela-amigos-computador.png')
    await botao(page, 'Ver perfil').click()
    await page.locator('[data-perfil]').getByText('Joga desde').waitFor()
    await page.waitForTimeout(1500)
    await foto('tela-perfil-computador.png')
    await botao(page, 'Partida amistosa').click()
    await botao(page, 'Brancas').waitFor()
    await page.waitForTimeout(1500)
    await foto('tela-amistosa-cor-computador.png')
    await botao(page, 'Brancas').click()
    await page.locator('[data-convite]').waitFor()
    await page.waitForTimeout(3000)
    await foto('tela-amistosa-espera-computador.png')
  })
  await sessao({ width: 390, height: 844 }, 'celular', async (page, foto) => {
    await foto('tela-menu-celular.png')
    await page.locator('main').getByRole('button', { name: /^Amigos/ }).click()
    await foto('tela-amigos-celular.png')
  })
  await sessao({ width: 844, height: 390 }, 'deitado', async (page, foto) => {
    await page.locator('main').getByRole('button', { name: /Expandir/ }).click()
    await page.waitForTimeout(4000)
    await foto('tela-menu-deitado.png')
    const medida = await page.evaluate(() => {
      const botoes = [...document.querySelectorAll('main button')].map((b) => b.getBoundingClientRect())
      return { baixo: Math.max(...botoes.map((b) => b.bottom)), altura: innerHeight }
    })
    console.log('deitado', JSON.stringify(medida))
  })
} catch (e) {
  console.log('PAROU:', e.message.split('\n')[0])
} finally {
  await browser.close()
}
