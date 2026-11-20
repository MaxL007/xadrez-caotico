import type * as THREE from 'three'
import { tremerTabuleiro } from '../combate/efeitosDasArmas'
import { tocarSom } from '../../som/sons'
import { congelar } from './relogioDoJogo'

// "O golpe que pesa": a sensação de cada captura acompanha a importância do lance. Tomar um peão é leve, tomar a dama é
// forte, e a arma também pesa (a marreta mais que o soco). Daqui saem:
// - o congelamento no impacto (hitstop): as animações do corpo param um instante no quadro em que o golpe acerta;
// - o tremor do tabuleiro, proporcional ao peso;
// - as vozes: o grunhido de quem golpeia e o gemido de quem apanha;
// - a antecipação (o corpo recua um palmo antes do golpe) e a continuação (um passo pra trás depois).
// A câmera que chega perto, a borda escurecendo e o ambiente abafado ficam com quem desenha (vistaDaCamera e
// ChessBoard3D), avisados por `SensacaoDaPartida`. Quem pediu menos movimento não tem câmera, tremor, borda pulsando nem
// peças balançando.

let menosMovimentoEscolhido = false

/** A opção "Menos movimento" das Configurações. */
export function definirMenosMovimento(sim: boolean) {
  menosMovimentoEscolhido = sim
}

/** Menos movimento: escolhido nas Configurações ou pedido pelo sistema do aparelho. */
export const menosMovimento = () => menosMovimentoEscolhido || window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** O que a cena faz junto com a captura: a câmera, a borda e o ambiente (ver ChessBoard3D). */
export interface SensacaoDaPartida {
  /** A captura começou: `ponto` é onde a luta acontece, `peso` de 0 a 1, `tom` o dos efeitos (trocas seguidas). */
  comecarLuta: (ponto: THREE.Vector3, peso: number, tom: number) => void
  /** A vítima saiu: tudo volta ao normal. */
  terminarLuta: () => void
}

// --- o peso -------------------------------------------------------------------------------------------------------
const VALOR_DA_PECA: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 9 }
/** Quanto pesa cada arma (e a luta sem arma, e as habilidades); o que não estiver aqui pesa 1. */
const PESO_DA_ARMA: Record<string, number> = {
  nenhuma: 0.75,
  katana: 0.85,
  espada: 0.95,
  cajado: 0.9,
  cristal: 0.95,
  marreta: 1.3,
  machado: 1.25,
  maca: 1.2,
  retalhamento: 1.1,
  puxao: 1.25,
}

/** De 0 a 1: o peso do golpe pela importância da peça capturada (peão leve, dama forte) e pela arma de quem golpeia. */
export function pesoDoGolpe(tipoDaVitima: string, arma = 'nenhuma'): number {
  const valor = VALOR_DA_PECA[tipoDaVitima] ?? 1
  return Math.min(1, (0.3 + (0.7 * (valor - 1)) / 8) * (PESO_DA_ARMA[arma] ?? 1))
}

/** O tom dos efeitos na troca de número `seguidas` (1 = a primeira captura): um semitom a mais por captura, até 5. */
export const tomDaTroca = (seguidas: number) => 2 ** (Math.min(Math.max(seguidas - 1, 0), 5) / 12)

/**
 * O golpe acertou: congela um instante (mais quanto mais pesa), treme o tabuleiro e solta as vozes. Devolve quantos ms o
 * corpo fica congelado: a queda da vítima espera esse tempo (`depoisDoCongelamento`). `tremer` falso quando a arma já
 * tem o tremor dela (a marreta).
 */
export function sentirImpacto(cena: THREE.Object3D, tipoAtacante: string, tipoVitima: string, peso: number, tremer = true): number {
  const ms = Math.round(40 + 90 * peso)
  congelar(ms)
  tocarSom(`voz:${tipoAtacante}`)
  tocarSom(`dor:${tipoVitima}`, 0.07)
  if (tremer) tremerTabuleiro(cena, (0.025 + 0.09 * peso) * (menosMovimento() ? 0.3 : 1), 260 + 220 * peso)
  return ms
}

/** Roda `fazer` quando o congelamento do impacto acabar. */
export function depoisDoCongelamento(ms: number, fazer: () => void) {
  window.setTimeout(fazer, ms)
}

// --- antecipação e continuação -------------------------------------------------------------------------------------------
const ANTECIPA_MS = 170
const CONTINUA_MS = 260

function animar(ms: number, passo: (t: number) => void, fim?: () => void) {
  const inicio = performance.now()
  const quadro = (agora: number) => {
    const t = Math.min(1, (agora - inicio) / ms)
    passo(t)
    if (t < 1) requestAnimationFrame(quadro)
    else fim?.()
  }
  requestAnimationFrame(quadro)
}

/** Antes do golpe, o corpo recua um palmo e volta (a antecipação); depois, `golpear`. */
export function antecipar(peca: THREE.Object3D, direcao: { x: number; z: number }, golpear: () => void) {
  const tamanho = Math.hypot(direcao.x, direcao.z)
  if (menosMovimento() || tamanho < 1e-6) {
    golpear()
    return
  }
  const recuo = 0.06 * peca.scale.x
  const base = { x: peca.position.x, z: peca.position.z }
  const dx = direcao.x / tamanho
  const dz = direcao.z / tamanho
  animar(
    ANTECIPA_MS,
    (t) => {
      const fora = Math.sin(Math.PI * t) * recuo
      peca.position.x = base.x - dx * fora
      peca.position.z = base.z - dz * fora
    },
    () => {
      peca.position.x = base.x
      peca.position.z = base.z
      golpear()
    },
  )
}

/** Depois do golpe, um passo curto pra trás (a continuação): o corpo absorvendo o tranco. */
export function continuarDoGolpe(peca: THREE.Object3D, direcao: { x: number; z: number }) {
  const tamanho = Math.hypot(direcao.x, direcao.z)
  if (menosMovimento() || tamanho < 1e-6) return
  const passo = 0.045 * peca.scale.x
  const base = { x: peca.position.x, z: peca.position.z }
  const dx = direcao.x / tamanho
  const dz = direcao.z / tamanho
  animar(CONTINUA_MS, (t) => {
    const atras = (1 - (1 - t) * (1 - t)) * passo
    peca.position.x = base.x - dx * atras
    peca.position.z = base.z - dz * atras
  })
}
