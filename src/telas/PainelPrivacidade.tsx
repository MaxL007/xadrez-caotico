import type { Idioma } from '../textos/idiomas'
import { PAGINA_DO_PROJETO, PRIVACIDADE } from '../textos/privacidade'

/** Privacidade e termos de uso, no idioma do jogo. */
export function PainelPrivacidade({ idioma }: { idioma: Idioma }) {
  const texto = PRIVACIDADE[idioma]
  return (
    <div className="space-y-4 text-sm leading-relaxed" data-privacidade>
      <p className="text-xs text-[#c9b48a]">{texto.atualizado}</p>
      <p>{texto.introducao}</p>
      {texto.secoes.map((secao) => (
        <section key={secao.titulo} className="space-y-1.5 border-t border-[#c9a24a]/20 pt-3">
          <h4 className="font-display font-semibold text-[#e6c675]">{secao.titulo}</h4>
          {secao.paragrafos.map((p) => (
            <p key={p} className="text-[#f0e0bf]">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="border-t border-[#c9a24a]/20 pt-3 text-xs text-[#c9b48a]">
        {texto.contato}{' '}
        <a href={PAGINA_DO_PROJETO} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#e6c675] underline underline-offset-2">
          {texto.linkContato}
        </a>
      </p>
    </div>
  )
}
