import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import type { Traduzir } from '../textos/idiomas'

// O QR Code do convite e o leitor pela câmera, na aba Amigos. Pra ler, o navegador que tem leitor próprio (o Chrome do
// Android) usa o dele; os outros (iPhone, computador) baixam o jsQR só na hora de abrir a câmera.

/** O QR Code de um texto, em SVG: nítido em qualquer tamanho, escuro sobre branco, com a margem que os leitores pedem. */
export function QrCode({ texto, tamanho, rotulo }: { texto: string; tamanho: number; rotulo: string }) {
  const { lado, caminho } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(texto)
    qr.make()
    const modulos = qr.getModuleCount()
    const margem = 4
    const quadrados: string[] = []
    for (let linha = 0; linha < modulos; linha++) {
      for (let coluna = 0; coluna < modulos; coluna++) if (qr.isDark(linha, coluna)) quadrados.push(`M${coluna + margem},${linha + margem}h1v1h-1z`)
    }
    return { lado: modulos + margem * 2, caminho: quadrados.join('') }
  }, [texto])
  return (
    <svg viewBox={`0 0 ${lado} ${lado}`} width={tamanho} height={tamanho} shapeRendering="crispEdges" role="img" aria-label={rotulo} className="rounded-lg" data-qr-code={texto}>
      <rect width={lado} height={lado} fill="#ffffff" />
      <path d={caminho} fill="#1c120a" />
    </svg>
  )
}

type Ler = (video: HTMLVideoElement, tela: HTMLCanvasElement) => Promise<string | null>

interface Detector {
  detect: (fonte: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}
interface ClasseDoDetector {
  new (opcoes: { formats: string[] }): Detector
  getSupportedFormats?: () => Promise<string[]>
}

async function criarLeitor(): Promise<Ler> {
  const Classe = (window as unknown as { BarcodeDetector?: ClasseDoDetector }).BarcodeDetector
  const formatos = Classe ? await (Classe.getSupportedFormats?.() ?? Promise.resolve([])).catch(() => []) : []
  if (Classe && formatos.includes('qr_code')) {
    const detector = new Classe({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
  }
  const { default: jsQR } = await import('jsqr')
  return async (video, tela) => {
    if (!video.videoWidth) return null
    // até 640 pixels no lado maior: o QR Code continua legível e o celular não esquenta
    const escala = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
    tela.width = Math.round(video.videoWidth * escala)
    tela.height = Math.round(video.videoHeight * escala)
    const contexto = tela.getContext('2d', { willReadFrequently: true })
    if (!contexto) return null
    contexto.drawImage(video, 0, 0, tela.width, tela.height)
    const { data } = contexto.getImageData(0, 0, tela.width, tela.height)
    return jsQR(data, tela.width, tela.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

/** A câmera de trás, lendo QR Codes a cada quarto de segundo; desliga sozinha ao fechar. */
export function LeitorDeQrCode({ t, onLido }: { t: Traduzir; onLido: (texto: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lidoRef = useRef(onLido)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    lidoRef.current = onLido
  }, [onLido])

  useEffect(() => {
    let parado = false
    let fluxo: MediaStream | null = null
    let relogio = 0
    const tela = document.createElement('canvas')
    void (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        const video = videoRef.current
        if (parado || !video) return
        video.srcObject = fluxo
        await video.play()
        const ler = await criarLeitor()
        const passo = async () => {
          if (parado) return
          const texto = await ler(video, tela).catch(() => null)
          if (parado) return
          if (texto) lidoRef.current(texto)
          relogio = window.setTimeout(() => void passo(), 250)
        }
        void passo()
      } catch {
        if (!parado) setFalhou(true)
      }
    })()
    return () => {
      parado = true
      window.clearTimeout(relogio)
      fluxo?.getTracks().forEach((faixa) => faixa.stop())
    }
  }, [])

  if (falhou) {
    return (
      <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
        {t('amigos.semCamera')}
      </p>
    )
  }
  return (
    <div className="space-y-1.5" data-leitor-qr>
      <div className="relative mx-auto aspect-square w-full max-w-[16rem] overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {/* a moldura onde o QR Code deve caber */}
        <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-lg border-2 border-[#e6c675]/80" />
      </div>
      <p className="text-center text-xs text-[#c9b48a]">{t('amigos.apontarCamera')}</p>
    </div>
  )
}
