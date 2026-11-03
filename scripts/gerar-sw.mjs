// Depois do build: grava dist/sw.js com a lista dos arquivos do site e a revisão (hash) de cada um. O aplicativo
// instalado compara as revisões e baixa só o que mudou. Roda no `npm run build`, também no GitHub.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.join(RAIZ, 'dist')
/** Ficam de fora: o próprio service worker e o que o jogo não usa (o PGN é a fonte do livro, o LEIA-ME é pra gente). */
const FORA = (caminho) => caminho === 'sw.js' || caminho.endsWith('.pgn') || caminho.endsWith('.txt')

function listar(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const completo = path.join(pasta, item.name)
    return item.isDirectory() ? listar(completo) : [completo]
  })
}

const arquivos = {}
for (const completo of listar(DIST).sort()) {
  const caminho = path.relative(DIST, completo).split(path.sep).join('/')
  if (FORA(caminho)) continue
  arquivos[caminho] = crypto.createHash('sha256').update(fs.readFileSync(completo)).digest('hex').slice(0, 12)
}

const modelo = fs.readFileSync(path.join(RAIZ, 'scripts', 'aplicativo', 'sw.js'), 'utf8')
if (!modelo.includes('/* ARQUIVOS */ {}')) throw new Error('scripts/aplicativo/sw.js sem o lugar da lista de arquivos')
fs.writeFileSync(path.join(DIST, 'sw.js'), modelo.replace('/* ARQUIVOS */ {}', JSON.stringify(arquivos, null, 2)))
const total = Object.keys(arquivos).reduce((soma, caminho) => soma + fs.statSync(path.join(DIST, caminho)).size, 0)
console.log(`sw.js: ${Object.keys(arquivos).length} arquivos guardados no aparelho, ${(total / 1024 / 1024).toFixed(1)} MB`)
