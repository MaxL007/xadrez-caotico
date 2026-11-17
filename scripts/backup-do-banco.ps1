# Cópia de segurança do banco de produção (D1), feita neste computador.
#
# O plano gratuito da Cloudflare não exporta o banco sozinho, então uma tarefa agendada do Windows roda este script uma
# vez por semana. Ele exporta o banco inteiro em SQL (`wrangler d1 export --remote`), compacta num .zip com a data no
# nome e guarda só as últimas cópias. As cópias têm os dados das contas (as senhas só embaralhadas): ficam numa pasta
# deste computador, nunca no repositório, que é público.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\backup-do-banco.ps1 -Destino "C:\pasta\das\copias"
# Para voltar uma cópia (apaga o banco atual!): descompacte o .zip e rode, em worker\,
#   npx wrangler d1 execute xadrez-caotico --remote --file caminho\da\copia.sql
# (antes, confira o ponto de volta do Time Travel: npx wrangler d1 time-travel info xadrez-caotico)

param(
  [Parameter(Mandatory = $true)][string]$Destino,
  # 9 semanas: um pouco mais de 2 meses, como diz a página de privacidade
  [int]$Manter = 9
)

$ErrorActionPreference = 'Stop'
$pastaDoWorker = Join-Path (Split-Path -Parent $PSScriptRoot) 'worker'
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$registro = Join-Path $Destino 'backup.log'
function Anotar([string]$texto) {
  $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $texto"
  Add-Content -Path $registro -Value $linha -Encoding utf8
  Write-Output $linha
}

$data = Get-Date -Format 'yyyy-MM-dd_HHmm'
$sql = Join-Path $Destino "xadrez-caotico-$data.sql"
$zip = "$sql.zip"
try {
  Push-Location $pastaDoWorker
  # o wrangler escreve o progresso no stderr; só o código de saída diz se deu certo
  $saida = & npx.cmd wrangler d1 export xadrez-caotico --remote --output $sql 2>&1 | Out-String
  $codigo = $LASTEXITCODE
  Pop-Location
  if ($codigo -ne 0 -or -not (Test-Path $sql) -or (Get-Item $sql).Length -lt 100) {
    throw "a exportação falhou (código $codigo): $($saida.Trim() -replace '\s+', ' ')"
  }
  Compress-Archive -Path $sql -DestinationPath $zip -Force
  Remove-Item $sql
  $tamanho = [math]::Round((Get-Item $zip).Length / 1KB, 1)
  Anotar "ok: $(Split-Path -Leaf $zip) ($tamanho KB)"

  # só as últimas $Manter cópias
  $copias = Get-ChildItem -Path $Destino -Filter 'xadrez-caotico-*.sql.zip' | Sort-Object Name -Descending
  foreach ($velha in ($copias | Select-Object -Skip $Manter)) {
    Remove-Item $velha.FullName
    Anotar "apagada a cópia antiga $($velha.Name)"
  }
} catch {
  if (Test-Path $sql) { Remove-Item $sql }
  Anotar "ERRO: $($_.Exception.Message)"
  exit 1
}
