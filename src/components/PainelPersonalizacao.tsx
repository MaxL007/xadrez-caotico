import { useEffect, useRef, useState, type PointerEvent } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ChaveTexto, Traduzir } from '../chess/idiomas'
import { desenhoDosPaineis } from '../chess/configXadrez'
import type { VitrineDaPeca } from '../chess/equipamentos'
import { CONQUISTAS } from '../chess/conquistas'
import { acessoDaOpcao, escolhaDaParte, escolherOpcao, opcaoLiberada, partesDaPeca, PECAS, usePersonalizacao, type ParteDaPeca, type Peca } from '../conta/personalizacao'
import { nomeDaConquista } from './PainelConquistas'
import { criarExpositor, desenharNoExpositor, noSuporte } from './expositor'

// Personalização, como no desenho do peão: a peça no meio e, dos lados, um quadrado por parte, ligado a ela por um
// traço. O quadrado é um expositor: o equipamento daquela parte sozinho, girando sobre um pedestal, ou vazio. Na peça
// do meio dá pra ver como ele fica vestido. Tocar num quadrado abre as opções da parte embaixo; o que ainda não foi
// liberado mostra a conquista que libera e o preço na Loja.

const ALTURA_MINIMA = 340
const ALTURA_POR_QUADRADO = 78
const LADO_DO_QUADRADO = 58
const GIRO_INICIAL = 0.55

/** Osso que o traço do quadrado aponta na peça. */
function ossoDaParte(peca: Peca, parte: string): string {
  if (parte === 'arma') return peca === 'b' ? 'mixamorigLeftHand' : 'mixamorigRightHand'
  const ossos: Record<string, string> = {
    cabeca: 'mixamorigHead',
    ombros: 'mixamorigLeftArm',
    maos: 'mixamorigLeftHand',
    peito: 'mixamorigSpine2',
    calca: 'mixamorigLeftLeg',
    botas: 'mixamorigLeftFoot',
    cavalo: 'Cavalo',
    sela: 'mixamorigHips',
    cabresto: 'Pescoco',
  }
  return ossos[parte]
}

type MontarExpositor = (tipo: string, parte: string, opcao: string) => THREE.Object3D | null

const rotuloDaParte = (t: Traduzir, peca: Peca, parte: string) => t((parte === 'arma' ? `personalizacao.arma.${peca}` : `personalizacao.parte.${parte}`) as ChaveTexto)

/** O corpo de cima vai à esquerda; o de baixo e a arma ou a montaria, à direita. */
const ladoDoQuadrado = (indice: number) => (indice < 4 ? 'esquerda' : 'direita')

/** Alta o bastante pra coluna mais cheia de quadrados. */
const alturaDaVitrine = (peca: Peca) => {
  const partes = partesDaPeca(peca).length
  return Math.max(ALTURA_MINIMA, Math.max(4, partes - 4) * ALTURA_POR_QUADRADO + 22)
}

/** O expositor fica vazio quando a parte está no padrão (e a arma, quando a peça está sem arma). */
const temAlgoVestido = (parte: ParteDaPeca, escolha: string) => escolha !== parte.opcoes[0]

interface PropsDaVitrine {
  t: Traduzir
  peca: Peca
  escolhas: Record<string, string>
  selecionada: string
  onSelecionar: (parte: string) => void
  montarVitrine: (tipo: string, escolhas: Record<string, string>) => VitrineDaPeca | null
  montarExpositor: MontarExpositor
}

function Vitrine({ t, peca, escolhas, selecionada, onSelecionar, montarVitrine, montarExpositor }: PropsDaVitrine) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const quadradosRef = useRef<(HTMLButtonElement | null)[]>([])
  const tracosRef = useRef<SVGSVGElement>(null)
  const cenaRef = useRef<{ trocar: (vitrine: VitrineDaPeca, tipo: Peca, expositores: (THREE.Object3D | null)[]) => void } | null>(null)
  const giroRef = useRef(GIRO_INICIAL)
  const arrasteRef = useRef<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const partes = partesDaPeca(peca)

  // a cena da vitrine: um renderizador só dela, que desenha a peça vestida e, em cada quadrado, o expositor
  useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa) return
    const renderer = new THREE.WebGLRenderer({ antialias: desenhoDosPaineis().antialias, alpha: true })
    renderer.setPixelRatio(desenhoDosPaineis().resolucao)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', touchAction: 'none' })
    caixa.prepend(renderer.domElement)
    const cena = new THREE.Scene()
    const gerador = new THREE.PMREMGenerator(renderer)
    const reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
    cena.environment = reflexo.texture
    cena.environmentIntensity = 0.55
    gerador.dispose()
    cena.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.6))
    const luz = new THREE.DirectionalLight(0xfff1dc, 2.6)
    luz.position.set(2, 4, 5)
    cena.add(luz)
    const contorno = new THREE.DirectionalLight(0xffe2b8, 1.4)
    contorno.position.set(-3, 3, -4)
    cena.add(contorno)
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50)
    const centro = new THREE.Vector3()
    let vitrine: VitrineDaPeca | null = null
    let ossos: (THREE.Object3D | undefined)[] = []

    // o expositor: uma cena à parte, com o pedestal, onde só o equipamento do quadrado aparece
    const expositor = criarExpositor(reflexo.texture)
    let expositores: (THREE.Group | null)[] = []

    function enquadrar() {
      if (!vitrine) return
      const caixaDaPeca = new THREE.Box3().setFromObject(vitrine.grupo)
      const tamanho = caixaDaPeca.getSize(new THREE.Vector3())
      caixaDaPeca.getCenter(centro)
      // a peça fica no meio, entre as duas colunas de quadrados
      const largura = caixa!.clientWidth - 2 * (LADO_DO_QUADRADO + 24)
      const proporcao = Math.max(largura, 60) / caixa!.clientHeight
      const visivel = Math.max(tamanho.y, tamanho.x / proporcao, tamanho.z / proporcao) * 1.15
      const distancia = visivel / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      camera.position.set(centro.x, centro.y + tamanho.y * 0.06, centro.z + distancia)
      camera.lookAt(centro)
    }

    function medir() {
      const largura = caixa!.clientWidth
      renderer.setSize(largura, caixa!.clientHeight, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = `${caixa!.clientHeight}px`
      camera.aspect = largura / caixa!.clientHeight
      camera.updateProjectionMatrix()
      enquadrar()
    }
    const observador = new ResizeObserver(medir)
    observador.observe(caixa)

    cenaRef.current = {
      trocar(nova, tipo, equipamentos) {
        if (vitrine) cena.remove(vitrine.grupo)
        vitrine = nova
        nova.atualizar(0)
        cena.add(nova.grupo)
        enquadrar()
        ossos = partesDaPeca(tipo).map(({ parte }) => nova.grupo.getObjectByName(ossoDaParte(tipo, parte)))
        for (const antigo of expositores) if (antigo) expositor.cena.remove(antigo)
        expositores = equipamentos.map((equipamento) => (equipamento ? noSuporte(equipamento) : null))
        for (const novo of expositores) if (novo) expositor.cena.add(novo)
      },
    }

    const relogio = new THREE.Clock()
    const ponto = new THREE.Vector3()
    const naTela = new THREE.Vector3()
    let quadro = 0
    function animar() {
      quadro = requestAnimationFrame(animar)
      if (!vitrine) return
      vitrine.atualizar(Math.min(relogio.getDelta(), 0.1))
      vitrine.grupo.rotation.y = giroRef.current
      const largura = caixa!.clientWidth
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, largura, caixa!.clientHeight)
      renderer.setClearColor(0x000000, 0)
      renderer.render(cena, camera)

      // os traços saem da parte e chegam no quadrado; dentro do quadrado, o equipamento sozinho, girando
      renderer.setScissorTest(true)
      renderer.setClearColor(0x2a1c10, 1)
      const tracos = tracosRef.current?.children
      const giroDoExpositor = performance.now() / 1400
      ossos.forEach((osso, i) => {
        const quadrado = quadradosRef.current[i]
        if (!quadrado || !osso) return
        osso.getWorldPosition(ponto)
        naTela.copy(ponto).project(camera)
        const traco = tracos?.[i] as SVGLineElement | undefined
        if (traco) {
          const naEsquerda = quadrado.offsetLeft < largura / 2
          traco.setAttribute('x1', String(naEsquerda ? quadrado.offsetLeft + quadrado.offsetWidth : quadrado.offsetLeft))
          traco.setAttribute('y1', String(quadrado.offsetTop + LADO_DO_QUADRADO / 2))
          traco.setAttribute('x2', String(((naTela.x + 1) / 2) * largura))
          traco.setAttribute('y2', String(((1 - naTela.y) / 2) * caixa!.clientHeight))
        }
        const equipamento = expositores[i]
        if (!equipamento) return
        const x = quadrado.offsetLeft + (quadrado.offsetWidth - LADO_DO_QUADRADO) / 2 + 2
        const y = caixa!.clientHeight - quadrado.offsetTop - LADO_DO_QUADRADO + 2
        const lado = LADO_DO_QUADRADO - 4
        equipamento.rotation.y = giroDoExpositor
        desenharNoExpositor(renderer, expositor, equipamento, expositores.filter((e): e is THREE.Group => e !== null), [x, y, lado, lado])
      })
      renderer.setScissorTest(false)
    }
    animar()

    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
      cenaRef.current = null
      reflexo.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [])

  // troca a peça quando muda a escolha; enquanto os modelos não chegam, tenta de novo
  const assinatura = JSON.stringify(escolhas)
  useEffect(() => {
    let tentativa = 0
    function montar() {
      const vestido = JSON.parse(assinatura) as Record<string, string>
      const vitrine = montarVitrine(peca, vestido)
      if (!vitrine) {
        tentativa = window.setTimeout(montar, 400)
        return
      }
      const equipamentos = partesDaPeca(peca).map((parte) => {
        const escolha = vestido[parte.parte] ?? parte.opcoes[0]
        return temAlgoVestido(parte, escolha) ? montarExpositor(peca, parte.parte, escolha) : null
      })
      cenaRef.current?.trocar(vitrine, peca, equipamentos)
      setCarregando(false)
    }
    montar()
    return () => window.clearTimeout(tentativa)
  }, [peca, assinatura, montarVitrine, montarExpositor])

  function arrastar(e: PointerEvent<HTMLDivElement>) {
    if (arrasteRef.current === null) return
    giroRef.current += (e.clientX - arrasteRef.current) * 0.012
    arrasteRef.current = e.clientX
  }

  const naColuna = (lado: 'esquerda' | 'direita') => partes.filter((_, i) => ladoDoQuadrado(i) === lado)
  const posicao = (indice: number) => {
    const lado = ladoDoQuadrado(indice)
    const coluna = naColuna(lado)
    const espaco = (alturaDaVitrine(peca) - 22) / coluna.length
    return { top: 6 + espaco * coluna.indexOf(partes[indice]) + (espaco - LADO_DO_QUADRADO - 14) / 2, [lado === 'esquerda' ? 'left' : 'right']: 6 }
  }

  return (
    <div
      ref={caixaRef}
      className="relative cursor-grab overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#3a2614_0%,#1c120a_75%)] active:cursor-grabbing"
      style={{ height: alturaDaVitrine(peca) }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        arrasteRef.current = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={arrastar}
      onPointerUp={() => (arrasteRef.current = null)}
      onPointerCancel={() => (arrasteRef.current = null)}
      data-vitrine={peca}
    >
      <svg ref={tracosRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
        {partes.map(({ parte }) => (
          <line key={parte} stroke={parte === selecionada ? '#e6c675' : '#c9a24a'} strokeOpacity={parte === selecionada ? 0.95 : 0.55} strokeWidth={parte === selecionada ? 1.6 : 1} />
        ))}
      </svg>
      {partes.map((parte, i) => {
        const escolha = escolhas[parte.parte] ?? parte.opcoes[0]
        const vestido = temAlgoVestido(parte, escolha)
        return (
          <button
            key={parte.parte}
            ref={(el) => {
              quadradosRef.current[i] = el
            }}
            type="button"
            onClick={() => onSelecionar(parte.parte)}
            aria-pressed={parte.parte === selecionada}
            aria-label={`${rotuloDaParte(t, peca, parte.parte)}: ${vestido ? t(`personalizacao.opcao.${escolha}` as ChaveTexto) : t('personalizacao.vazio')}`}
            className="absolute flex w-[4.5rem] flex-col items-center"
            style={posicao(i)}
            data-caixa={parte.parte}
          >
            <span
              className={`flex items-center justify-center rounded-md border-2 ${parte.parte === selecionada ? 'border-[#e6c675]' : 'border-[#c9a24a]/60'} ${vestido ? '' : 'bg-[#1c120a]/80'}`}
              style={{ width: LADO_DO_QUADRADO, height: LADO_DO_QUADRADO }}
            >
              {!vestido && <span className="text-[0.6rem] text-[#8f7a58]">{t('personalizacao.vazio')}</span>}
            </span>
            <span className="mt-0.5 max-w-full truncate text-[0.6rem] font-semibold text-[#c9b48a]">{rotuloDaParte(t, peca, parte.parte)}</span>
          </button>
        )
      })}
      {carregando && <p className="absolute inset-0 flex items-center justify-center text-xs text-[#c9b48a]">{t('personalizacao.carregando')}</p>}
      <p className="pointer-events-none absolute bottom-1.5 left-0 right-0 text-center text-[0.6rem] text-[#c9b48a]">{t('personalizacao.girar')}</p>
    </div>
  )
}

export function PainelPersonalizacao({
  t,
  montarVitrine,
  montarExpositor,
}: {
  t: Traduzir
  montarVitrine: (tipo: string, escolhas: Record<string, string>) => VitrineDaPeca | null
  /** O equipamento sozinho, fora da peça, pro expositor de cada quadrado. */
  montarExpositor: MontarExpositor
}) {
  const personalizacao = usePersonalizacao()
  const [peca, setPeca] = useState<Peca>('p')
  const [selecionada, setSelecionada] = useState('cabeca')
  const [erro, setErro] = useState(false)
  const parte = partesDaPeca(peca).find((p) => p.parte === selecionada) ?? partesDaPeca(peca)[0]
  const atual = escolhaDaParte(personalizacao.escolhas, peca, parte)

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t('menu.personalizacao')} className="grid grid-cols-6 gap-1">
        {PECAS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={peca === p}
            onClick={() => setPeca(p)}
            className={`truncate rounded-lg border px-1 py-1.5 text-[0.7rem] font-semibold transition ${peca === p ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] hover:bg-[#3a2614]'}`}
          >
            {t(`personalizacao.peca.${p}` as ChaveTexto)}
          </button>
        ))}
      </div>

      <Vitrine
        t={t}
        peca={peca}
        escolhas={personalizacao.escolhas[peca] ?? {}}
        selecionada={parte.parte}
        onSelecionar={setSelecionada}
        montarVitrine={montarVitrine}
        montarExpositor={montarExpositor}
      />

      {!personalizacao.conta && <p className="text-xs text-[#c9b48a]">🔒 {t('personalizacao.entrar')}</p>}
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t('conta.erroConexao')}
        </p>
      )}

      <div className="space-y-2" data-opcoes={parte.parte}>
        <p className="text-sm font-medium">{rotuloDaParte(t, peca, parte.parte)}</p>
        <div role="radiogroup" aria-label={rotuloDaParte(t, peca, parte.parte)} className="grid grid-cols-2 gap-2">
          {parte.opcoes.map((opcao) => {
            const liberada = opcaoLiberada(personalizacao, peca, parte.parte, opcao)
            const acesso = acessoDaOpcao(peca, parte.parte, opcao)
            const conquista = acesso.tipo !== 'livre' && acesso.conquista ? CONQUISTAS.find((c) => c.id === acesso.conquista) : undefined
            return (
              <button
                key={opcao}
                type="button"
                role="radio"
                aria-checked={atual === opcao}
                disabled={!liberada}
                onClick={() => {
                  setErro(false)
                  escolherOpcao(peca, parte, opcao).catch(() => setErro(true))
                }}
                className={`rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed ${
                  atual === opcao ? 'border-[#e6c675] bg-[#c9a24a] text-[#1c120a]' : 'border-[#c9a24a]/40 text-[#f5e6c8] enabled:hover:bg-[#3a2614]'
                }`}
              >
                <span className={`block text-xs font-semibold ${liberada ? '' : 'opacity-60'}`}>
                  {liberada ? '' : '🔒 '}
                  {t(`personalizacao.opcao.${opcao}` as ChaveTexto)}
                </span>
                {!liberada && personalizacao.conta && acesso.tipo !== 'livre' && (
                  <span className="mt-0.5 block text-[0.6rem] leading-snug text-[#c9b48a]">
                    {acesso.tipo === 'loja'
                      ? conquista
                        ? t('personalizacao.naLojaOuConquista', { preco: acesso.preco, conquista: nomeDaConquista(t, conquista) })
                        : t('personalizacao.naLoja', { preco: acesso.preco })
                      : conquista && t('personalizacao.pelaConquista', { conquista: nomeDaConquista(t, conquista) })}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
