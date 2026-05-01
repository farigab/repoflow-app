$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Generating Windows icon...'
node .\scripts\generate-ico.mjs

Write-Host 'Building app bundles...'
node .\esbuild.mjs

Write-Host 'Creating NSIS installer...'
& .\node_modules\.bin\electron-builder.cmd --win nsis

Write-Host 'Installer created in release\'
