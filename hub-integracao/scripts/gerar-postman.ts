// Grava a collection do Postman e o ambiente em docs/hub/postman (os mesmos arquivos que o painel oferece para baixar):
//   npm run postman        (na raiz do hub)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarAmbiente, montarColecao, totalDeRequisicoes } from '../apps/api/src/postman.js';

const saida = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'hub', 'postman');
mkdirSync(saida, { recursive: true });
writeFileSync(resolve(saida, 'Hub-API.postman_collection.json'), JSON.stringify(montarColecao(), null, 2) + '\n');
writeFileSync(resolve(saida, 'Hub.postman_environment.json'), JSON.stringify(montarAmbiente(), null, 2) + '\n');
console.log(`Collection gerada em ${saida}: ${totalDeRequisicoes()} requisicoes.`);
