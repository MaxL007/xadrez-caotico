import conquistas from '../../src/catalogos/conquistas.json'

// Cada título sai de um grupo de conquistas (o METAMORFO, das três de ascensões). A pessoa escolhe um pra mostrar embaixo
// do nome na partida; o servidor confere se ela recebeu todas as conquistas dele (a conta com tudo liberado usa todos).

/** Os títulos do catálogo e as conquistas que cada um pede. */
export const TITULOS = new Map(conquistas.titulos.map((titulo) => [titulo.id, titulo.conquistas]))

/** O título gravado, se ainda existe no catálogo. */
export const tituloValido = (titulo: string | null | undefined): string | null => (titulo && TITULOS.has(titulo) ? titulo : null)
