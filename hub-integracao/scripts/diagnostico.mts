// Diagnostico de um Hub em producao/piloto. Somente leitura.
//   HUB_URL=https://hub.exemplo.com HUB_EMAIL=voce@x.com HUB_SENHA=... npm run diagnostico
// Opcionais: HUB_EMPRESA (id ou nome), HUB_TERMINAL_TOKEN (tk_...). Sai com codigo 1 se algo falhou.
import { diagnosticar, resumo } from '../apps/api/src/diagnostico.js';

const url = process.env.HUB_URL;
if (!url) { console.error('Defina HUB_URL (ex.: http://localhost:4000).'); process.exit(2); }
const r = await diagnosticar({ url, email: process.env.HUB_EMAIL, senha: process.env.HUB_SENHA, empresa: process.env.HUB_EMPRESA, terminalToken: process.env.HUB_TERMINAL_TOKEN });
const marca = { ok: '[ OK ]', atencao: '[ !! ]', falha: '[FALHA]' } as const;
for (const x of r) console.log(`${marca[x.nivel]} ${x.item}: ${x.detalhe}`);
const s = resumo(r);
console.log(`\n${s.ok} ok, ${s.atencao} atencao, ${s.falha} falha(s).`);
process.exit(s.falha ? 1 : 0);
