import { useEffect, useRef, useState, type PointerEvent } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ChaveTexto, Traduzir } from '../chess/idiomas'
import { desenhoDosPaineis } from '../chess/configXadrez'
import { urlDoAvatar } from '../conta/aparencia'
import { comprarItem, NA_LOJA, opcaoLiberada, PECAS, usePersonalizacao, type Peca } from '../conta/personalizacao'
import { ErroDoServidor } from '../db/servidor'
import { Oticoin } from './ElementosDoJogador'
import { criarExpositor, desenharNoExpositor, noSuporte } from './expositor'

// A Loja tem três abas: Armaduras, peça por peça; Armas e Habilidades especiais, cada uma numa lista só, separada pela
// peça que usa. A compra vale só pra aquela peça (o item é 'peça:parte:opção'): por isso o cajado e o cristal aparecem
// uma vez em cada peça que os usa. Cada equipamento aparece em 3D num expositor (a habilidade, pelo símbolo dela);
// tocar abre ele grande, pra girar com o dedo.

type MontarExpositor = (tipo: string, parte: string, opcao: string) => THREE.Object3D | null
type Aba = 'armaduras' | 'armas' | 'habilidades'
/** As abas que são uma lista só, separada por peça. */
type AbaPorPeca = Exclude<Aba, 'armaduras'>

const ABAS: Aba[] = ['armaduras', 'armas', 'habilidades']
const ICONE_DA_ABA: Record<Aba, string> = { armaduras: '🛡️', armas: '⚔️', habilidades: '✨' }
const AVATAR_DA_PECA: Record<Peca, string> = { p: 'peao-brancas', r: 'torre-brancas', n: 'cavalo-brancas', b: 'bispo-brancas', q: 'dama-brancas', k: 'rei-brancas' }

/** A parte de cada aba por peça: as armas e as habilidades especiais ('golpe'). */
const PARTE_DA_ABA: Record<AbaPorPeca, string> = { armas: 'arma', habilidades: 'golpe' }
const daAbaPorPeca = (id: string) => Object.values(PARTE_DA_ABA).includes(id.split(':')[0])

/** Por peça, os itens daquela parte, na ordem do catálogo; só as peças que têm algum. */
function porPeca(parte: string) {
  return PECAS.map((peca) => ({
    peca,
    itens: Object.entries(NA_LOJA[peca])
      .filter(([id]) => id.startsWith(`${parte}:`))
      .map(([id, preco]): [string, number] => [`${peca}:${id}`, preco]),
  })).filter(({ itens }) => itens.length > 0)
}

const POR_PECA: Record<AbaPorPeca, ReturnType<typeof porPeca>> = { armas: porPeca('arma'), habilidades: porPeca('golpe') }
const TODOS_POR_PECA: Record<AbaPorPeca, string[]> = {
  armas: POR_PECA.armas.flatMap(({ itens }) => itens.map(([item]) => item)),
  habilidades: POR_PECA.habilidades.flatMap(({ itens }) => itens.map(([item]) => item)),
}

function partesDoItem(item: string) {
  const [peca, parte, opcao] = item.split(':')
  return { peca: peca as Peca, parte, opcao }
}

function precoDoItem(item: string): number | undefined {
  const { peca, parte, opcao } = partesDoItem(item)
  return NA_LOJA[peca]?.[`${parte}:${opcao}`]
}

/** O elemento que rola a Loja: o canvas cobre só a parte dela que está à vista, senão uma lista comprida passaria do
 * tamanho de canvas que o celular aceita. */
function quemRola(el: HTMLElement): HTMLElement | null {
  for (let pai = el.parentElement; pai; pai = pai.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(pai).overflowY)) return pai
  }
  return null
}

/** Um renderizador por cima da Loja, que só desenha dentro dos retângulos dos expositores. */
function usePalco(raiz: React.RefObject<HTMLDivElement | null>, montarExpositor: MontarExpositor, itens: string[]) {
  const vistasRef = useRef(new Map<string, HTMLElement>())
  const giroManualRef = useRef<number | null>(null)
  const cenaRef = useRef<{ montar: (itens: string[]) => void } | null>(null)

  useEffect(() => {
    const caixa = raiz.current
    if (!caixa) return
    const renderer = new THREE.WebGLRenderer({ antialias: desenhoDosPaineis().antialias, alpha: true })
    renderer.setPixelRatio(desenhoDosPaineis().resolucao)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.setClearColor(0x000000, 0)
    // sem margem: o espaçamento entre os filhos da Loja empurraria o canvas pra baixo dos cartões
    Object.assign(renderer.domElement.style, { position: 'absolute', left: '0', top: '0', margin: '0', pointerEvents: 'none', zIndex: '10' })
    caixa.append(renderer.domElement)
    const rolagem = quemRola(caixa)
    const gerador = new THREE.PMREMGenerator(renderer)
    const reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
    gerador.dispose()
    const expositor = criarExpositor(reflexo.texture)
    const equipamentos = new Map<string, THREE.Group>()

    cenaRef.current = {
      montar(lista) {
        for (const antigo of equipamentos.values()) expositor.cena.remove(antigo)
        equipamentos.clear()
        for (const item of lista) {
          const { peca, parte, opcao } = partesDoItem(item)
          const equipamento = montarExpositor(peca, parte, opcao)
          if (!equipamento) continue
          const suporte = noSuporte(equipamento)
          equipamentos.set(item, suporte)
          expositor.cena.add(suporte)
        }
      },
    }

    const medida = { largura: 0, altura: 0, topo: -1 }
    let quadro = 0
    function animar() {
      quadro = requestAnimationFrame(animar)
      // o canvas acompanha a faixa da Loja que aparece dentro de quem rola
      const fora = caixa!.getBoundingClientRect()
      const janela = rolagem?.getBoundingClientRect()
      const deCima = Math.max(fora.top, janela?.top ?? 0, 0)
      const deBaixo = Math.min(fora.bottom, janela?.bottom ?? window.innerHeight, window.innerHeight)
      const topo = Math.max(0, Math.round(deCima - fora.top))
      const largura = caixa!.clientWidth
      const altura = Math.max(1, Math.round(deBaixo - deCima))
      if (medida.largura !== largura || medida.altura !== altura) {
        renderer.setSize(largura, altura, false)
        Object.assign(renderer.domElement.style, { width: `${largura}px`, height: `${altura}px` })
        medida.largura = largura
        medida.altura = altura
      }
      if (medida.topo !== topo) {
        renderer.domElement.style.top = `${topo}px`
        medida.topo = topo
      }
      const cima = fora.top + topo
      const baixo = cima + altura
      renderer.setScissorTest(false)
      renderer.clear()
      renderer.setScissorTest(true)
      const giro = giroManualRef.current ?? performance.now() / 1400
      for (const [item, vista] of vistasRef.current) {
        const equipamento = equipamentos.get(item)
        if (!equipamento || !vista.isConnected) continue
        const r = vista.getBoundingClientRect()
        // fora da vista não desenha
        if (r.bottom <= cima || r.top >= baixo || r.width === 0) continue
        equipamento.rotation.y = giro
        desenharNoExpositor(renderer, expositor, equipamento, equipamentos.values(), [r.left - fora.left, baixo - r.bottom, r.width, r.height])
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

  const assinatura = itens.join('|')
  useEffect(() => {
    cenaRef.current?.montar(assinatura.split('|'))
  }, [assinatura, montarExpositor])

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
  const [aba, setAba] = useState<Aba>('armaduras')
  const [peca, setPeca] = useState<Peca>('p')
  /** O item aberto grande, inteiro ('peça:parte:opção'). */
  const [aberto, setAberto] = useState<string | null>(null)
  /** Depois de trocar de tela, rola até esse elemento: a parte de uma peça nas Armas (ou Habilidades) ou o cartão que
   * estava aberto. */
  const [rolarAte, setRolarAte] = useState<string | null>(null)
  const [comprando, setComprando] = useState(false)
  const [erro, setErro] = useState<ChaveTexto | null>(null)
  const raizRef = useRef<HTMLDivElement>(null)
  const arrasteRef = useRef<{ x: number; giro: number } | null>(null)
  const armaduras = Object.entries(NA_LOJA[peca])
    .filter(([id]) => !daAbaPorPeca(id))
    .map(([id, preco]): [string, number] => [`${peca}:${id}`, preco])
  /** No fim das armaduras, os atalhos pras armas e as habilidades daquela peça. */
  const atalhos = (['armas', 'habilidades'] as AbaPorPeca[]).filter((a) => POR_PECA[a].some((daPeca) => daPeca.peca === peca))
  const { vistasRef, giroManualRef } = usePalco(raizRef, montarExpositor, aba === 'armaduras' ? armaduras.map(([item]) => item) : TODOS_POR_PECA[aba])

  useEffect(() => {
    if (!rolarAte) return
    raizRef.current?.querySelector(rolarAte)?.scrollIntoView({ block: rolarAte.startsWith('[data-item') ? 'center' : 'start' })
    setRolarAte(null)
  }, [rolarAte])

  const vista = (item: string) => (el: HTMLElement | null) => {
    if (el) vistasRef.current.set(item, el)
    else vistasRef.current.delete(item)
  }

  async function comprar(item: string) {
    setComprando(true)
    setErro(null)
    try {
      onSaldo(await comprarItem(item))
    } catch (falha) {
      setErro(falha instanceof ErroDoServidor && falha.message === 'saldo-insuficiente' ? 'loja.semSaldo' : 'conta.erroConexao')
    } finally {
      setComprando(false)
    }
  }

  const nomeDaPeca = (p: Peca) => t(`personalizacao.peca.${p}` as ChaveTexto)
  const nomeDoItem = (item: string) => t(`personalizacao.opcao.${partesDoItem(item).opcao}` as ChaveTexto)

  function abrir(item: string) {
    giroManualRef.current = null
    setAberto(item)
  }

  function irPara(destino: AbaPorPeca, p: Peca) {
    setAba(destino)
    setAberto(null)
    setRolarAte(`[data-${destino}-da-peca="${p}"]`)
  }

  /** Nas armas e habilidades, de quem é: o retrato e o nome da peça (e, no retalhamento, que ele pede a katana). */
  function etiquetaDaPeca(item: string, grande = false) {
    const { peca: p, opcao } = partesDoItem(item)
    return (
      <span className={`flex min-w-0 items-center gap-1 font-semibold text-[#e6c675] ${grande ? 'text-xs' : 'text-[0.65rem]'}`} data-peca-da-arma={p}>
        <img src={urlDoAvatar(AVATAR_DA_PECA[p])} alt="" className={`${grande ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 rounded-full bg-[#1c120a] object-cover ring-1 ring-[#c9a24a]/60`} />
        <span className="truncate">
          {nomeDaPeca(p)}
          {opcao === 'retalhamento' && ` · ${t('loja.comAKatana')}`}
        </span>
      </span>
    )
  }

  function botaoDeCompra(item: string, preco: number) {
    const { peca: p, parte, opcao } = partesDoItem(item)
    if (opcaoLiberada(personalizacao, p, parte, opcao)) return <span className="text-xs font-semibold text-[#9fe0a8]">✓ {t('loja.liberado')}</span>
    return (
      <button
        type="button"
        disabled={saldo == null || saldo < preco || comprando}
        onClick={(e) => {
          e.stopPropagation()
          void comprar(item)
        }}
        className="flex items-center gap-1 rounded-lg border border-[#c9a24a]/60 px-2.5 py-1.5 text-xs font-semibold text-[#f5e6c8] transition enabled:hover:bg-[#3a2614] disabled:opacity-50"
      >
        {t('loja.comprar')}
        <Oticoin tamanho={16} />
        {preco}
      </button>
    )
  }

  function cartao(item: string, preco: number) {
    const { parte } = partesDoItem(item)
    return (
      <div key={item} className="rounded-lg bg-[#2a1c10] p-2" data-item={item}>
        <button type="button" aria-label={`${nomeDoItem(item)} · ${t('loja.ver')}`} onClick={() => abrir(item)} className="block w-full">
          <span ref={vista(item)} className="block aspect-square w-full rounded-md bg-[radial-gradient(ellipse_at_center,#3a2614_0%,#1c120a_80%)]" />
          <span className="mt-1.5 block truncate text-left text-xs font-semibold">{nomeDoItem(item)}</span>
          {aba !== 'armaduras' ? (
            <span className="mt-0.5 block">{etiquetaDaPeca(item)}</span>
          ) : (
            <span className="block truncate text-left text-[0.65rem] text-[#c9b48a]">{t(`personalizacao.parte.${parte}` as ChaveTexto)}</span>
          )}
        </button>
        <div className="mt-1.5">{botaoDeCompra(item, preco)}</div>
      </div>
    )
  }

  const precoAberto = aberto ? precoDoItem(aberto) : undefined

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

      <div role="tablist" aria-label={t('menu.loja')} className="grid grid-cols-3 gap-1 rounded-xl border border-[#c9a24a]/40 bg-[#2a1c10]/60 p-1">
        {ABAS.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => {
              setAba(a)
              setAberto(null)
            }}
            className={`truncate rounded-lg px-1 py-2 text-[0.8rem] font-semibold transition ${aba === a ? 'bg-[#c9a24a] text-[#1c120a]' : 'text-[#f5e6c8] hover:bg-[#3a2614]'}`}
          >
            <span aria-hidden="true">{ICONE_DA_ABA[a]} </span>
            {t(`loja.aba.${a}` as ChaveTexto)}
          </button>
        ))}
      </div>

      {aba === 'armaduras' && (
        <div role="tablist" aria-label={t('loja.aba.armaduras')} className="grid grid-cols-6 gap-1">
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
              {nomeDaPeca(p)}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-[#c9b48a]">{t(aba === 'armas' ? 'loja.explicacaoArmas' : aba === 'habilidades' ? 'loja.explicacaoHabilidades' : 'loja.explicacao')}</p>
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t(erro)}
        </p>
      )}

      {aberto && precoAberto !== undefined ? (
        // o equipamento grande, pra ver de perto e girar com o dedo
        <div className="space-y-3" data-item-aberto={aberto}>
          <button
            type="button"
            className="text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline"
            onClick={() => {
              setAberto(null)
              setRolarAte(`[data-item="${aberto}"]`)
            }}
          >
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
              <p className="truncate text-base font-semibold">{nomeDoItem(aberto)}</p>
              {aba !== 'armaduras' ? (
                etiquetaDaPeca(aberto, true)
              ) : (
                <p className="text-xs text-[#c9b48a]">
                  {t(`personalizacao.parte.${partesDoItem(aberto).parte}` as ChaveTexto)} · {nomeDaPeca(partesDoItem(aberto).peca)}
                </p>
              )}
            </div>
            {botaoDeCompra(aberto, precoAberto)}
          </div>
        </div>
      ) : aba !== 'armaduras' ? (
        <div className="space-y-5">
          {POR_PECA[aba].map(({ peca: p, itens }) => (
            <div key={p} className="scroll-mt-2 space-y-2" {...{ [`data-${aba}-da-peca`]: p }}>
              <h4 className="flex items-center gap-2 border-b border-[#c9a24a]/30 pb-1.5 font-display text-base font-semibold">
                <img src={urlDoAvatar(AVATAR_DA_PECA[p])} alt="" className="h-9 w-9 shrink-0 rounded-full bg-[#2a1c10] object-cover ring-1 ring-[#c9a24a]/60" />
                {t(`loja.${aba}Da.${p}` as ChaveTexto)}
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{itens.map(([item, preco]) => cartao(item, preco))}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{armaduras.map(([item, preco]) => cartao(item, preco))}</div>
          {atalhos.map((destino) => (
            <button
              key={destino}
              type="button"
              onClick={() => irPara(destino, peca)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#c9a24a]/60 px-3 py-2 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614]"
              data-ir-para={destino}
            >
              <span aria-hidden="true">{ICONE_DA_ABA[destino]}</span>
              {t(`loja.${destino}Da.${peca}` as ChaveTexto)} →
            </button>
          ))}
        </>
      )}
    </div>
  )
}
