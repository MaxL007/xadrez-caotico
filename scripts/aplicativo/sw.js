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

// --- os avisos com o jogo fechado (Web Push; ver worker/src/push.ts) ----------------------------------------------------
// O servidor manda o aviso cifrado pro serviço de push do navegador, que acorda este service worker mesmo com o jogo
// fechado: ele mostra a notificação. Tocar nela abre o jogo (ou traz pra frente a janela que já estava aberta) no
// endereço do aviso: a partida (?sala=) ou os Amigos (?amigos=1).
self.addEventListener('push', (evento) => {
  let aviso = {}
  try {
    aviso = evento.data ? evento.data.json() : {}
  } catch {
    aviso = { titulo: 'Xadrez Caótico', texto: evento.data ? evento.data.text() : '' }
  }
  evento.waitUntil(
    (async () => {
      // com o jogo aberto e à vista, quem cuida é a própria tela (a partida já mostra o lance): sem aviso repetido
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (janelas.some((janela) => janela.visibilityState === 'visible' && janela.focused)) return
      await self.registration.showNotification(aviso.titulo || 'Xadrez Caótico', {
        body: aviso.texto || '',
        tag: aviso.etiqueta || 'xadrez',
        renotify: true,
        icon: enderecoDe('icones/icone-192.png'),
        // o ícone pequeno da barra do Android: só a transparência vale, então é a óticoin em silhueta branca (o ícone
        // opaco virava um quadrado branco). Sai de scripts/gerar-insignia.mjs
        badge: enderecoDe('icones/insignia-96.png'),
        data: { url: enderecoDe(aviso.url || '') },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = evento.notification.data && evento.notification.data.url ? evento.notification.data.url : ESCOPO
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const aberta = janelas.find((janela) => janela.url.startsWith(ESCOPO))
      if (aberta) {
        // a janela já aberta vai pro endereço do aviso (a tela lê o ?sala= e o ?amigos=)
        await aberta.focus()
        aberta.postMessage({ tipo: 'abrir-aviso', url: destino })
        return
      }
      await self.clients.openWindow(destino)
    })(),
  )
})

// o navegador trocou a inscrição (as chaves venceram): a próxima abertura do jogo inscreve de novo
self.addEventListener('pushsubscriptionchange', () => {})
