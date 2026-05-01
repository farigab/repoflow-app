$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Branding Electron binaries...'
node .\scripts\brand-electron-binaries.mjs

Write-Host 'Building app bundles...'
node .\esbuild.mjs

Write-Host 'Creating NSIS installer...'
& .\node_modules\.bin\electron-builder.cmd --win nsis

Write-Host 'Installer created in release\'
