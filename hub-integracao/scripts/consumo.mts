// Relatorio de consumo dos terminais (somente leitura), direto no banco do Hub.
//   npm run consumo                 # ultimas 72 h
//   npm run consumo -- 48           # ultimas 48 h
// Le HUB_DATABASE_URL do ambiente (o npm carrega o .env da raiz).
import { criarPool } from '../apps/api/src/db.js';
import { relatorioConsumo } from '../apps/api/src/consumo.js';

const url = process.env.HUB_DATABASE_URL;
if (!url) { console.error('Defina HUB_DATABASE_URL.'); process.exit(2); }
const horas = Number(process.argv[2] ?? 72);
const db = criarPool(url);
const r = await relatorioConsumo(db, horas).catch(async (e) => {
  console.error((e as { code?: string }).code === '42P01' ? 'Falta aplicar as migracoes (019). Reinicie o Hub ou rode npm run migrate e tente de novo.' : (e as Error).message);
  await db.end();
  process.exit(1);
});
const pad = (s: unknown, n: number) => String(s).padEnd(n);
const num = (s: unknown, n: number) => String(s).padStart(n);

console.log(`\n=== Consumo dos terminais (janela real: ${r.horas} h) ===\n`);
console.log(`${pad('Terminal', 24)}${pad('Empresa', 22)}${pad('Amb.', 6)}${num('Req', 8)}${num('Pings', 8)}${num('Erros', 7)}${num('ms med', 8)}${num('KB ent', 9)}${num('KB sai', 9)}`);
for (const t of r.terminais) console.log(`${pad(t.terminal.slice(0, 23), 24)}${pad(t.empresa.slice(0, 21), 22)}${pad(t.ambiente === 'producao' ? 'prod' : 'hml', 6)}${num(t.requisicoes, 8)}${num(t.pings, 8)}${num(t.erros, 7)}${num(t.msMedio, 8)}${num(t.kbEntrada, 9)}${num(t.kbSaida, 9)}`);

console.log('\n--- O que mais trafega (por operacao/rota) ---');
console.log(`${pad('Operacao', 34)}${num('Req', 7)}${num('ms med', 8)}${num('KB/resp', 9)}${num('KB total', 10)}${num('Itens', 8)}`);
for (const x of r.rotas) console.log(`${pad(x.rota.slice(0, 33), 34)}${num(x.requisicoes, 7)}${num(x.msMedio, 8)}${num(x.kbSaidaMedio, 9)}${num(x.kbTotal, 10)}${num(x.itens, 8)}`);

console.log('\n--- Requisicoes por hora do dia (horario de Cuiaba) ---');
const max = Math.max(...r.porHora.map((x) => x.n), 1);
for (const x of r.porHora) console.log(`${String(x.h).padStart(2, '0')}h ${'#'.repeat(Math.round((x.n / max) * 40))} ${x.n}`);

if (r.envios.length) { console.log('\n--- Envios do PDV (nota, caixa, e-mail) ---'); for (const e of r.envios) console.log(`${pad(e.tipo, 18)}${num(e.n, 6)} envio(s), ${Math.round(e.bytes / 1024 * 10) / 10} KB cada (conteudo)`); }

const x = r.extrapolacao;
console.log('\n--- Extrapolacao (o que esta janela representa) ---');
console.log(`Requisicoes por dia: ${x.requisicoesDia} (${x.requisicoesDiaPorTerminal} por terminal)`);
console.log(`Trafego: ${x.mbDia} MB/dia  ->  ~${x.mbMes} MB/mes`);
console.log(`Contadores gravados: ${x.linhasLogDia} linha(s)/dia (~${x.bytesPorLinhaDeLog} bytes cada) -> ${x.mbBancoDia} MB/dia no banco (o log completo guarda so os erros)`);
console.log(`\nBanco do Hub agora: ${r.banco.mb} MB  |  ${r.banco.tabelas.map((t) => `${t.tabela} ${t.mb} MB`).join('  |  ')}`);
console.log('\nObs.: KB ent/sai so contam requisicoes feitas depois da migracao 019; o ping e estimado em ~230 bytes.');
await db.end();
