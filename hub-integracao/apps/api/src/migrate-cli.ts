import { config } from './config.js';
import { criarPool } from './db.js';
import { migrar } from './migrate.js';

const db = criarPool(config().databaseUrl);
const feitas = await migrar(db);
console.log(feitas.length ? `aplicadas: ${feitas.join(', ')}` : 'nada a aplicar');
await db.end();
