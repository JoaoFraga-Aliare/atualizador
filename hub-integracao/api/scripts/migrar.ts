import { fileURLToPath } from 'node:url';
import { migrar } from '../src/migracoes.js';

const url = process.env.DATABASE_URL_MIGRATION;
if (!url) {
  console.error('Defina DATABASE_URL_MIGRATION (usuário dono do schema).');
  process.exit(1);
}
const aplicadas = await migrar(url, fileURLToPath(new URL('../migrations', import.meta.url)));
console.log(aplicadas.length ? `${aplicadas.length} migration(s) aplicada(s).` : 'Banco já está atualizado.');
