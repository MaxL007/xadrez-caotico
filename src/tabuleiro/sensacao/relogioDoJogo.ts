// O relógio das animações do corpo (os clipes das peças, as lutas, a marreta, o puxão), que para no congelamento do
// impacto ("o golpe que pesa", ver golpeQuePesa.ts). Fica num arquivo sem dependências: a marreta, a luta sem arma e o
// puxão marcam o começo deles aqui.

let congeladoAte = 0
let tempoCongelado = 0
let ultimoQuadro = 0
let congelamentos = 0

/** Congela por `ms` as animações do corpo. */
export function congelar(ms: number) {
  congeladoAte = Math.max(congeladoAte, performance.now() + ms)
  congelamentos++
}

/** Uma vez por quadro, no laço de desenho: diz se o quadro está congelado e devolve o relógio do jogo, que não anda
 * enquanto congela. */
export function passarQuadro(agora: number): { agora: number; congelado: boolean } {
  const passou = ultimoQuadro ? agora - ultimoQuadro : 0
  ultimoQuadro = agora
  const congelado = agora < congeladoAte
  if (congelado) tempoCongelado += passou
  return { agora: agora - tempoCongelado, congelado }
}

/** O relógio do jogo: o de sempre, menos o tempo que passou congelado. */
export const agoraDoJogo = () => performance.now() - tempoCongelado

/** Só nos testes: quantas vezes congelou desde que a página abriu. */
export const quantosCongelamentos = () => congelamentos
