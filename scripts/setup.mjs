import { copyFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} terminou com codigo ${code}`))));
  });
}

if (!(await exists('backend/.env'))) {
  await copyFile('backend/.env.example', 'backend/.env');
  console.log('Criado backend/.env a partir do exemplo (somente desenvolvimento).');
}

await run('npm', ['ci', '--prefix', 'backend']);
await run('npm', ['ci', '--prefix', 'frontend']);
console.log('Ambiente preparado. Execute: npm run dev');
