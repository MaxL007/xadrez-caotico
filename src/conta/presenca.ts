import { avisarQueSaiu, marcarPresenca, ouvirSessao, sessaoAtual } from '../dados/servidor'

// A bolinha verde dos amigos. Com a conta aberta e o jogo à vista (no menu, numa partida, em qualquer tela), o aparelho
// avisa o servidor a cada minuto. Ao esconder a aba, trocar de aplicativo ou fechar, avisa que saiu: o amigo vê a
// bolinha apagar na hora, e não só quando os avisos param de chegar.

const INTERVALO_MS = 60 * 1000

export function iniciarPresenca() {
  let relogio = 0
  const avisar = () => {
    if (sessaoAtual() && !document.hidden) void marcarPresenca().catch(() => undefined)
  }
  const recomecar = () => {
    window.clearInterval(relogio)
    avisar()
    relogio = window.setInterval(avisar, INTERVALO_MS)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) avisarQueSaiu()
    else recomecar()
  })
  window.addEventListener('pagehide', avisarQueSaiu)
  // entrou na conta: aparece na hora
  ouvirSessao(recomecar)
  recomecar()
}
