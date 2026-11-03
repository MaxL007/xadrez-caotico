// O service worker do Xadrez Caótico instalado como aplicativo. Guarda no aparelho os arquivos do site (modelos 3D,
// livro de aberturas, código), pra abrir sem baixar tudo de novo e jogar contra a máquina sem internet; a cada versão
// nova baixa só os arquivos que mudaram. A lista e a revisão de cada arquivo entram no build (scripts/gerar-sw.mjs).
// O servidor do jogo fica em outro endereço e nunca passa por aqui: contas, amigos e partidas online vão direto.

const ARQUIVOS = /* ARQUIVOS */ {}
const CACHE = 'xadrez-caotico'
const FONTES = 'xadrez-caotico-fontes'
const ESCOPO = self.registration.scope
const REVISOES = new URL('__revisoes__', ESCOPO).href
const enderecoDe = (caminho) => new URL(caminho, ESCOPO).href

async function revisoesGuardadas(cache) {
  const resposta = await cache.match(REVISOES)
  return resposta ? resposta.json() : { atual: {}, anterior: {} }
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const { atual } = await revisoesGuardadas(cache)
      const mudaram = []
      for (const [caminho, revisao] of Object.entries(ARQUIVOS)) {
        if (atual[caminho] !== revisao || !(await cache.match(enderecoDe(caminho)))) mudaram.push(caminho)
      }
      // baixa tudo o que mudou antes de guardar qualquer coisa: se um falhar, a versão nova fica pra depois, inteira
      const baixados = await Promise.all(
        mudaram.map(async (caminho) => {
          const resposta = await fetch(enderecoDe(caminho), { cache: 'no-cache' })
          if (!resposta.ok) throw new Error(`${caminho}: ${resposta.status}`)
          return [caminho, resposta]
        }),
      )
      for (const [caminho, resposta] of baixados) await cache.put(enderecoDe(caminho), resposta)
      await cache.put(REVISOES, new Response(JSON.stringify({ atual: ARQUIVOS, anterior: atual })))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // os arquivos da versão anterior ficam mais uma rodada: uma tela antiga ainda aberta pode pedir algum deles
      const cache = await caches.open(CACHE)
      const { atual, anterior } = await revisoesGuardadas(cache)
      const manter = new Set([REVISOES, ...Object.keys(atual).map(enderecoDe), ...Object.keys(anterior).map(enderecoDe)])
      for (const pedido of await cache.keys()) if (!manter.has(pedido.url)) await cache.delete(pedido)
      for (const nome of await caches.keys()) if (nome !== CACHE && nome !== FONTES) await caches.delete(nome)
      await self.clients.claim()
    })(),
  )
})

/** As fontes do Google não mudam: depois da primeira vez, vêm do aparelho. */
async function daFonte(pedido) {
  const cache = await caches.open(FONTES)
  const guardada = await cache.match(pedido)
  if (guardada) return guardada
  const resposta = await fetch(pedido)
  if (resposta.ok) await cache.put(pedido, resposta.clone())
  return resposta
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request
  if (pedido.method !== 'GET') return
  const { origin } = new URL(pedido.url)
  if (origin === 'https://fonts.googleapis.com' || origin === 'https://fonts.gstatic.com') {
    evento.respondWith(daFonte(pedido))
    return
  }
  if (!pedido.url.startsWith(ESCOPO)) return
  if (pedido.mode === 'navigate') {
    // a página vem sempre da rede quando há internet: assim ninguém fica com o jogo velho falando com o servidor novo
    evento.respondWith(fetch(pedido).catch(async () => (await caches.match(enderecoDe('index.html'))) ?? Response.error()))
    return
  }
  evento.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(pedido))
      .then((guardada) => guardada ?? fetch(pedido)),
  )
})
