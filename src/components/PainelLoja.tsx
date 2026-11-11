import { useEffect, useRef, useState, type PointerEvent } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ChaveTexto, Traduzir } from '../chess/idiomas'
import { desenhoDosPaineis } from '../chess/configXadrez'
import { comprarItem, NA_LOJA, opcaoLiberada, PECAS, usePersonalizacao, type Peca } from '../conta/personalizacao'
import { ErroDoServidor } from '../db/servidor'
import { Oticoin } from './ElementosDoJogador'
import { criarExpositor, desenharNoExpositor, noSuporte } from './expositor'

// A Loja: o que cada peça compra com óticoins, a tabela de preços por peça. Cada equipamento aparece em 3D num
// expositor; tocar abre ele grande, pra girar com o dedo. As armas e o resto saem pelas conquistas.

type MontarExpositor = (tipo: string, parte: string, opcao: string) => THREE.Object3D | null

/** Um renderizador por cima da Loja, que só desenha dentro dos retângulos dos expositores. */
function usePalco(raiz: React.RefObject<HTMLDivElement | null>, montarExpositor: MontarExpositor, peca: Peca, ids: string[]) {
  const vistasRef = useRef(new Map<string, HTMLElement>())
  const giroManualRef = useRef<number | null>(null)
  const cenaRef = useRef<{ montar: (tipo: Peca, ids: string[]) => void } | null>(null)

  useEffect(() => {
    const caixa = raiz.current
    if (!caixa) return
    const renderer = new THREE.WebGLRenderer({ antialias: desenhoDosPaineis().antialias, alpha: true })
    renderer.setPixelRatio(desenhoDosPaineis().resolucao)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.setClearColor(0x000000, 0)
    // sem margem: o espaçamento entre os filhos da Loja empurraria o canvas pra baixo dos cartões
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', margin: '0', pointerEvents: 'none', zIndex: '10' })
    caixa.append(renderer.domElement)
    const gerador = new THREE.PMREMGenerator(renderer)
    const reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
    gerador.dispose()
    const expositor = criarExpositor(reflexo.texture)
    const equipamentos = new Map<string, THREE.Group>()

    cenaRef.current = {
      montar(tipo, lista) {
        for (const antigo of equipamentos.values()) expositor.cena.remove(antigo)
        equipamentos.clear()
        for (const id of lista) {
          const [parte, opcao] = id.split(':')
          const equipamento = montarExpositor(tipo, parte, opcao)
          if (!equipamento) continue
          const suporte = noSuporte(equipamento)
          equipamentos.set(id, suporte)
          expositor.cena.add(suporte)
        }
      },
    }

    let quadro = 0
    function animar() {
      quadro = requestAnimationFrame(animar)
      const largura = caixa!.clientWidth
      const altura = caixa!.clientHeight
      if (renderer.domElement.width !== Math.round(largura * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(altura * renderer.getPixelRatio())) {
        renderer.setSize(largura, altura, false)
        Object.assign(renderer.domElement.style, { width: `${largura}px`, height: `${altura}px` })
      }
      renderer.setScissorTest(false)
      renderer.clear()
      renderer.setScissorTest(true)
      const fora = caixa!.getBoundingClientRect()
      const giro = giroManualRef.current ?? performance.now() / 1400
      for (const [id, vista] of vistasRef.current) {
        const equipamento = equipamentos.get(id)
        if (!equipamento || !vista.isConnected) continue
        const r = vista.getBoundingClientRect()
        equipamento.rotation.y = giro
        desenharNoExpositor(renderer, expositor, equipamento, equipamentos.values(), [r.left - fora.left, fora.bottom - r.bottom, r.width, r.height])
      }
      renderer.setScissorTest(false)
    }
    animar()

    return () => {
      cancelAnimationFrame(quadro)
      cenaRef.current = null
      reflexo.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
    // o palco é um só; os equipamentos são trocados pelo efeito de baixo
  }, [raiz, montarExpositor])

  const assinatura = ids.join('|')
  useEffect(() => {
    cenaRef.current?.montar(peca, assinatura.split('|'))
  }, [peca, assinatura, montarExpositor])

  return { vistasRef, giroManualRef }
}

export function PainelLoja({
  t,
  saldo,
  onSaldo,
  montarExpositor,
}: {
  t: Traduzir
  saldo: number | null
  onSaldo: (saldo: number) => void
  montarExpositor: MontarExpositor
}) {
  const personalizacao = usePersonalizacao()
  const [peca, setPeca] = useState<Peca>('p')
  const [aberto, setAberto] = useState<string | null>(null)
  const [comprando, setComprando] = useState(false)
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const raizRef = useRef<HTMLDivElement>(null)
  const arrasteRef = useRef<{ x: number; giro: number } | null>(null)
  const itens = Object.entries(NA_LOJA[peca])
  const { vistasRef, giroManualRef } = usePalco(raizRef, montarExpositor, peca, itens.map(([id]) => id))

  const vista = (id: string) => (el: HTMLElement | null) => {
    if (el) vistasRef.current.set(id, el)
    else vistasRef.current.delete(id)
  }

  async function comprar(id: string) {
    setComprando(true)
    setErro(null)
    try {
      onSaldo(await comprarItem(`${peca}:${id}`))
    } catch (falha) {
      setErro(falha instanceof ErroDoServidor && falha.message === 'saldo-insuficiente' ? 'loja.semSaldo' : 'conta.erroConexao')
    } finally {
      setComprando(false)
    }
  }

  const nomeDoItem = (id: string) => {
    const [parte, opcao] = id.split(':')
    return { nome: t(`personalizacao.opcao.${opcao}` as ChaveTexto), parte: t(`personalizacao.parte.${parte}` as ChaveTexto) }
  }

  function botaoDeCompra(id: string, preco: number) {
    const [parte, opcao] = id.split(':')
    if (opcaoLiberada(personalizacao, peca, parte, opcao)) return <span className="text-xs font-semibold text-[#9fe0a8]">✓ {t('loja.liberado')}</span>
    return (
      <button
        type="button"
        disabled={saldo == null || saldo < preco || comprando}
        onClick={(e) => {
          e.stopPropagation()
          void comprar(id)
        }}
        className="flex items-center gap-1 rounded-lg border border-[#c9a24a]/60 px-2.5 py-1.5 text-xs font-semibold text-[#f5e6c8] transition enabled:hover:bg-[#3a2614] disabled:opacity-50"
      >
        {t('loja.comprar')}
        <Oticoin tamanho={16} />
        {preco}
      </button>
    )
  }

  const precoAberto = aberto ? NA_LOJA[peca][aberto] : undefined

  return (
    <div ref={raizRef} className="relative space-y-3" data-loja>
      {saldo != null ? (
        <p className="flex items-center justify-center gap-2 text-sm font-semibold" data-saldo-loja>
          <Oticoin tamanho={28} girando />
          {t('loja.saldo', { n: saldo })}
        </p>
      ) : (
        <p className="text-xs text-[#c9b48a]">{t('loja.entrar')}</p>
      )}

      <div role="tablist" aria-label={t('menu.loja')} className="grid grid-cols-6 gap-1">
        {PECAS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={peca === p}
            onClick={() => {
              setPeca(p)
              setAberto(null)
            }}
            className={`truncate rounded-lg border px-1 py-1.5 text-[0.7rem] font-semibold transition ${peca === p ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'}`}
          >
            {t(`personalizacao.peca.${p}` as ChaveTexto)}
          </button>
        ))}
      </div>

      <p className="text-xs text-[#c9b48a]">{t('loja.explicacao')}</p>
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}

      {aberto && precoAberto !== undefined ? (
        // o equipamento grande, pra ver de perto e girar com o dedo
        <div className="space-y-3" data-item-aberto={`${peca}:${aberto}`}>
          <button type="button" className="text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline" onClick={() => setAberto(null)}>
            {t('loja.voltar')}
          </button>
          <div
            ref={vista(aberto)}
            className="mx-auto aspect-square w-full max-w-[18rem] cursor-grab touch-none rounded-xl bg-[radial-gradient(ellipse_at_center,#3a2614_0%,#1c120a_75%)] active:cursor-grabbing"
            onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
              arrasteRef.current = { x: e.clientX, giro: giroManualRef.current ?? performance.now() / 1400 }
              giroManualRef.current = arrasteRef.current.giro
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (arrasteRef.current) giroManualRef.current = arrasteRef.current.giro + (e.clientX - arrasteRef.current.x) * 0.012
            }}
            onPointerUp={() => (arrasteRef.current = null)}
            onPointerCancel={() => (arrasteRef.current = null)}
          />
          <p className="text-center text-[0.65rem] text-[#c9b48a]">{t('personalizacao.girar')}</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{nomeDoItem(aberto).nome}</p>
              <p className="text-xs text-[#c9b48a]">
                {nomeDoItem(aberto).parte} · {t(`personalizacao.peca.${peca}` as ChaveTexto)}
              </p>
            </div>
            {botaoDeCompra(aberto, precoAberto)}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {itens.map(([id, preco]) => (
            <div key={id} className="rounded-lg bg-[#2a1c10] p-2" data-item={`${peca}:${id}`}>
              <button
                type="button"
                aria-label={`${nomeDoItem(id).nome} · ${t('loja.ver')}`}
                onClick={() => {
                  giroManualRef.current = null
                  setAberto(id)
                }}
                className="block w-full"
              >
                <span ref={vista(id)} className="block aspect-square w-full rounded-md bg-[radial-gradient(ellipse_at_center,#3a2614_0%,#1c120a_80%)]" />
                <span className="mt-1.5 block truncate text-left text-xs font-semibold">{nomeDoItem(id).nome}</span>
                <span className="block truncate text-left text-[0.65rem] text-[#c9b48a]">{nomeDoItem(id).parte}</span>
              </button>
              <div className="mt-1.5">
                {botaoDeCompra(id, preco)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
