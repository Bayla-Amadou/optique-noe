<#
.SYNOPSIS
  Prépare un PC Windows pour qu'il soit une borne N.O.A qui tourne 24 h sur 24 :
  veille interdite, démarrage automatique, surveillant externe, redémarrage
  de nuit.

.DESCRIPTION
  À lancer UNE FOIS, en administrateur, sur la borne :
      powershell -ExecutionPolicy Bypass -File installer-borne.ps1 -Exe "C:\NOA\NOA Optique.exe"

  Pourquoi un surveillant EXTERNE en plus de celui de l'application : celui de
  l'application (rechargement de la page, relance du programme) ne peut rien
  si Electron lui-même est mort ou gelé. Une tâche planifiée Windows, elle,
  vérifie chaque minute que le programme tourne et le relance sinon. C'est
  l'équivalent des « watchdog scripts » des bornes de restauration rapide.

  Ce script N'A PAS ÉTÉ EXÉCUTÉ sur une vraie machine Windows par son auteur :
  il a été écrit sans PowerShell sous la main. À essayer d'abord sur une
  borne de test, pas en boutique.

  Ce qu'il ne fait PAS : le mode « Accès attribué » de Windows (qui enferme la
  session dans une seule application) et l'ouverture de session automatique.
  Ils se règlent dans Windows, voir DEPLOIEMENT.md, section 16.
#>
param(
  [Parameter(Mandatory = $true)][string]$Exe,          # chemin complet de NOA Optique.exe
  [string]$RedemarrageNuit = "04:10",                  # heure du redémarrage de Windows ; "" pour désactiver
  [switch]$Desinstaller
)
$ErrorActionPreference = "Stop"
$estAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $estAdmin) { throw "Lancer ce script en tant qu'administrateur." }

$noms = @("NOA-Demarrage", "NOA-Surveillant", "NOA-Redemarrage-Nuit")
if ($Desinstaller) {
  foreach ($n in $noms) { Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue }
  Write-Host "Tâches N.O.A supprimées."; return
}
if (-not (Test-Path $Exe)) { throw "Introuvable : $Exe" }
$dossier = Split-Path $Exe -Parent
if (-not (Test-Path (Join-Path $dossier "borne.json"))) {
  Write-Warning "Pas de borne.json à côté du programme : sans lui, l'application s'ouvrira en fenêtre normale, pas en mode borne."
}

# 1. L'écran et la machine ne s'endorment jamais.
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-dc 0 | Out-Null
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change standby-timeout-dc 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Write-Host "[1/4] Veille désactivée."

# 2. Démarrage à l'ouverture de session.
$action = New-ScheduledTaskAction -Execute $Exe -WorkingDirectory $dossier
$decl   = New-ScheduledTaskTrigger -AtLogOn
$regl   = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "NOA-Demarrage" -Action $action -Trigger $decl -Settings $regl -RunLevel Limited -Force | Out-Null
Write-Host "[2/4] Démarrage automatique à l'ouverture de session."

# 3. Le surveillant : chaque minute, si le programme ne tourne plus, on le relance.
$nomProc = [IO.Path]::GetFileNameWithoutExtension($Exe)
$cmd = "if (-not (Get-Process -Name '$nomProc' -ErrorAction SilentlyContinue)) { Start-Process -FilePath '$Exe' -WorkingDirectory '$dossier' }"
$actW = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
$declW = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "NOA-Surveillant" -Action $actW -Trigger $declW -Settings $regl -Force | Out-Null
Write-Host "[3/4] Surveillant externe : relance le programme s'il n'est plus là (vérification chaque minute)."

# 4. Redémarrage de Windows la nuit : un Windows qui tourne des semaines finit par se dégrader.
if ($RedemarrageNuit) {
  $actR = New-ScheduledTaskAction -Execute "shutdown.exe" -Argument "/r /t 60 /c `"Redémarrage nocturne de la borne N.O.A`""
  $declR = New-ScheduledTaskTrigger -Daily -At $RedemarrageNuit
  Register-ScheduledTask -TaskName "NOA-Redemarrage-Nuit" -Action $actR -Trigger $declR -User "SYSTEM" -RunLevel Highest -Force | Out-Null
  Write-Host "[4/4] Redémarrage de Windows chaque nuit à $RedemarrageNuit."
}
Write-Host "`nTerminé. Redémarrez la borne pour vérifier qu'elle revient seule."
