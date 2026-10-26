import { spawn } from 'node:child_process';
import process from 'node:process';

const children = [
  spawn('npm', ['run', 'dev', '--prefix', 'backend'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev', '--prefix', 'frontend'], { stdio: 'inherit', shell: true })
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) {
  child.on('error', error => {
    console.error(error);
    stop(1);
  });
  child.on('exit', code => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
