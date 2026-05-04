param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GitArgs
  )

  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "La commande git $($GitArgs -join ' ') a echoue."
  }
}

$root = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) {
  throw "Impossible de trouver la racine du depot Git."
}
Set-Location $root

$branch = git branch --show-current
if ($LASTEXITCODE -ne 0) {
  throw "Impossible de lire la branche courante."
}
if ([string]::IsNullOrWhiteSpace($branch)) {
  throw "Le depot est en HEAD detache. Passez sur une branche avant de sauvegarder."
}

Invoke-Git add -A

$status = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw "Impossible de lire l'etat Git."
}
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host "Aucun changement a sauvegarder."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  $Message = "session: sauvegarde du $stamp"
}

Invoke-Git commit --no-verify -m $Message
Invoke-Git push origin $branch

Write-Host "Session sauvegardee sur origin/$branch."
