#!/usr/bin/env node

const path = require('node:path');
const { spawn } = require('node:child_process');

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

const child = spawn(command, commandArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  shell: false
});

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
