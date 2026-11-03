import { criarApp } from './app.js';
import { carregarConfig } from './config.js';
import { criarPool } from './db.js';

const config = carregarConfig();
const pool = criarPool(config.DATABASE_URL);
const app = await criarApp(config, pool);

const encerrar = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

await app.listen({ port: config.PORT, host: config.HOST });
