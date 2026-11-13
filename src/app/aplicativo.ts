import { useSyncExternalStore } from 'react'

// O jogo como aplicativo instalado. O service worker (scripts/aplicativo/sw.js) só existe no site publicado: no
// desenvolvimento e nos testes o site funciona como sempre. Daqui sai o botão de instalar e o aviso de versão nova.

/** O pedido que o Chrome e o Edge guardam pra instalar com um toque. */
interface PedidoDeInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface Estado {
  /** O navegador deixa instalar com um toque (Android, computador). */
  pedido: PedidoDeInstalacao | null
  /** iPhone e iPad: instala pelo Compartilhar, em "Adicionar à Tela de Início". */
  noIphone: boolean
  /** Já está aberto como aplicativo. */
  instalado: boolean
  /** Saiu uma versão nova do jogo depois que esta tela abriu; falta recarregar. */
  versaoNova: boolean
}

const abertoComoAplicativo = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

let estado: Estado = { pedido: null, noIphone: false, instalado: false, versaoNova: false }
const ouvintes = new Set<() => void>()

function mudarEstado(mudanca: Partial<Estado>) {
  estado = { ...estado, ...mudanca }
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function useAplicativo() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
    () => estado,
  )
}

/** Abre a pergunta de instalação do navegador. */
export async function instalarAplicativo() {
  const pedido = estado.pedido
  if (!pedido) return
  await pedido.prompt()
  const { outcome } = await pedido.userChoice
  // o pedido só vale uma vez; se a pessoa recusou, o navegador oferece de novo mais tarde
  mudarEstado({ pedido: null, instalado: outcome === 'accepted' })
}

/** O código e o estilo que a página carrega: os nomes mudam a cada versão publicada do jogo. */
const versaoDe = (documento: Document) =>
  [...documento.querySelectorAll('script[src], link[rel=stylesheet][href]')]
    .map((elemento) => elemento.getAttribute('src') ?? elemento.getAttribute('href') ?? '')
    .filter((endereco) => endereco.includes('/assets/'))
    .sort()
    .join('|')

/** Compara a página aberta com a publicada; a página vem sempre da rede, então só uma tela aberta há tempo fica velha. */
async function conferirVersao(daPagina: string) {
  try {
    const resposta = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })
    if (!resposta.ok) return
    const publicada = versaoDe(new DOMParser().parseFromString(await resposta.text(), 'text/html'))
    if (publicada && publicada !== daPagina) mudarEstado({ versaoNova: true })
  } catch {
    // sem internet: segue a versão que está no aparelho
  }
}

export function iniciarAplicativo() {
  const instalado = abertoComoAplicativo()
  mudarEstado({ instalado, noIphone: !instalado && ehIphone() })
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault()
    mudarEstado({ pedido: evento as PedidoDeInstalacao })
  })
  window.addEventListener('appinstalled', () => mudarEstado({ pedido: null, instalado: true }))

  if (!import.meta.env.PROD) return
  const daPagina = versaoDe(document)
  const temServiceWorker = 'serviceWorker' in navigator
  // o aplicativo instalado pode ficar dias aberto em segundo plano: ao voltar pra ele, confere se há versão nova
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void conferirVersao(daPagina)
    if (temServiceWorker) void navigator.serviceWorker.getRegistration().then((registro) => registro?.update()).catch(() => undefined)
  })
  if (temServiceWorker) window.addEventListener('load', () => void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined))
}
