#!/usr/bin/env node

const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const electronBinary = path.join(workspaceRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const packagedExecutable = path.join(workspaceRoot, 'release', 'win-unpacked', 'RepoFlow.exe');
const forwardedArgs = process.argv.slice(2);

const command = process.platform === 'win32' && require('node:fs').existsSync(packagedExecutable)
  ? packagedExecutable
  : electronBinary;

const commandArgs = command === packagedExecutable
  ? forwardedArgs
  : ['.', ...forwardedArgs];

const shouldDetach = process.platform === 'win32';

function quoteWindowsArgument(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function launchViaWindowsManagementApi() {
  const commandLine = [command, ...commandArgs].map(quoteWindowsArgument).join(' ');
  const script = [
    `$command = '${commandLine.replaceAll("'", "''")}'`,
    'Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command } | Out-Null'
  ].join('; ');

  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      cwd: workspaceRoot,
      stdio: 'ignore',
      windowsHide: true
    }
  );
}

if (shouldDetach && command === packagedExecutable) {
  try {
    launchViaWindowsManagementApi();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to launch RepoFlow: ${message}`);
    process.exit(1);
  }
}

const child = spawn(command, commandArgs, {
  cwd: workspaceRoot,
  stdio: shouldDetach ? 'ignore' : 'inherit',
  detached: shouldDetach,
  windowsHide: shouldDetach,
  shell: false
});

if (shouldDetach) {
  child.unref();
  process.exit(0);
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to launch RepoFlow: ${message}`);
  process.exit(1);
});
