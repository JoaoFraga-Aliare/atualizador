// Gera SQL das tabelas espelhadas do PDV a partir do pg_dump --schema-only de referência.
// Uso: node scripts/gerar-espelho.mjs > migrations/NNNN_xxx.sql
// Para incluir mais tabelas, acrescente o nome em CADASTROS ou MOVIMENTOS e gere uma nova migration
// (nunca edite uma migration já aplicada).
import { readFileSync } from 'node:fs';

const CADASTROS = (process.env.CADASTROS ?? 'produto,clifor,condpagto').split(',');
const MOVIMENTOS = (process.env.MOVIMENTOS ?? 'venda').split(',');
const DUMP = new URL('../../docs/referencia/pdv-schema.sql', import.meta.url);

const sql = readFileSync(DUMP, 'utf8');

function colunas(tabela) {
  const m = sql.match(new RegExp(`CREATE TABLE public\\.${tabela} \\(\\n([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`tabela ${tabela} não encontrada no dump`);
  return m[1].split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean).map((l) => {
    const [nome, ...resto] = l.split(/\s+/);
    let def = resto.join(' ');
    // character(n) vira varchar(n): o Hub não guarda o preenchimento com espaços do bpchar
    def = def.replace(/^character\((\d+)\)/, 'varchar($1)').replace(/^character\b(?!\s+varying)/, 'varchar(1)');
    def = def.replace(/^character varying/, 'varchar');
    def = def.replace(/\s*DEFAULT nextval\([^)]*\)(::regclass)?/, ''); // ids vêm do PDV/ERP
    return { nome, def };
  });
}

function chavePrimaria(tabela) {
  const m = sql.match(new RegExp(`ALTER TABLE ONLY public\\.${tabela}\\s+ADD CONSTRAINT \\S+ PRIMARY KEY \\(([^)]*)\\)`));
  return m ? m[1].split(',').map((c) => c.trim()) : [];
}

const saida = [];
const p = (s = '') => saida.push(s);

p('-- Gerado por scripts/gerar-espelho.mjs a partir de docs/referencia/pdv-schema.sql. NÃO editar à mão.');
p(`-- Cadastros: ${CADASTROS.join(', ')} | Movimentos: ${MOVIMENTOS.join(', ')}`);
p('-- Colunas emp_empresa/uni_unidade/fil_filial/*_hlg/*_cx permanecem como ids externos do player;');
p('-- empresa_id (uuid do Hub) é o tenant. character(n) -> varchar(n).');
p();

function tabela(nome, movimento) {
  const cols = colunas(nome);
  const pk = chavePrimaria(nome);
  const cabecalho = [
    '  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE',
    ...(movimento ? ['  id uuid NOT NULL', '  caixa_id uuid NOT NULL', '  recebido_em timestamptz NOT NULL DEFAULT now()'] : []),
    ...(!movimento && pk.length === 0 ? ['  hub_id bigint GENERATED ALWAYS AS IDENTITY'] : []),
  ];
  const corpo = cols.map((c) => {
    const nn = pk.includes(c.nome) && !/NOT NULL/.test(c.def) ? ' NOT NULL' : '';
    return `  ${c.nome} ${c.def}${nn}`;
  });
  const rodape = ['  hub_versao bigint NOT NULL DEFAULT 0', '  hub_atualizado_em timestamptz NOT NULL DEFAULT now()'];
  const restricoes = [];
  if (movimento) {
    restricoes.push('  PRIMARY KEY (empresa_id, id)');
    restricoes.push('  FOREIGN KEY (caixa_id, empresa_id) REFERENCES caixa(id, empresa_id)');
    if (pk.length) restricoes.push(`  UNIQUE (empresa_id, caixa_id, ${pk.join(', ')})`);
  } else {
    restricoes.push(`  PRIMARY KEY (empresa_id, ${pk.length ? pk.join(', ') : 'hub_id'})`);
  }
  p(`CREATE TABLE ${nome} (`);
  p([...cabecalho, ...corpo, ...rodape, ...restricoes].join(',\n'));
  p(');');
  p(`CREATE INDEX ${nome}_sync ON ${nome} (empresa_id, hub_versao);`);
  p(`CREATE TRIGGER ${nome}_versao BEFORE INSERT OR UPDATE ON ${nome} FOR EACH ROW EXECUTE PROCEDURE hub_bump_versao();`);
  p(`ALTER TABLE ${nome} ENABLE ROW LEVEL SECURITY;`);
  p(`ALTER TABLE ${nome} FORCE ROW LEVEL SECURITY;`);
  if (movimento) {
    // caixa só enxerga e grava o próprio movimento; escrita só com papel caixa (ou admin)
    p(`CREATE POLICY ler ON ${nome} FOR SELECT USING (hub_eh_admin() OR (empresa_id = hub_empresa_atual() AND (hub_caixa_atual() IS NULL OR caixa_id = hub_caixa_atual())));`);
    p(`CREATE POLICY gravar ON ${nome} FOR INSERT WITH CHECK (hub_eh_admin() OR (hub_papel_atual() = 'caixa' AND empresa_id = hub_empresa_atual() AND caixa_id = hub_caixa_atual()));`);
    p(`CREATE POLICY atualizar ON ${nome} FOR UPDATE USING (hub_eh_admin() OR (hub_papel_atual() = 'caixa' AND empresa_id = hub_empresa_atual() AND caixa_id = hub_caixa_atual())) WITH CHECK (hub_eh_admin() OR (empresa_id = hub_empresa_atual() AND caixa_id = hub_caixa_atual()));`);
    p(`GRANT SELECT, INSERT, UPDATE ON ${nome} TO hub_app;`);
  } else {
    p(`CREATE POLICY ler ON ${nome} FOR SELECT USING (hub_eh_admin() OR empresa_id = hub_empresa_atual());`);
    p(`CREATE POLICY gravar ON ${nome} FOR INSERT WITH CHECK (hub_eh_admin() OR (hub_papel_atual() = 'empresa' AND empresa_id = hub_empresa_atual()));`);
    p(`CREATE POLICY atualizar ON ${nome} FOR UPDATE USING (hub_eh_admin() OR (hub_papel_atual() = 'empresa' AND empresa_id = hub_empresa_atual())) WITH CHECK (hub_eh_admin() OR empresa_id = hub_empresa_atual());`);
    p(`CREATE POLICY apagar ON ${nome} FOR DELETE USING (hub_eh_admin() OR (hub_papel_atual() = 'empresa' AND empresa_id = hub_empresa_atual()));`);
    p(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${nome} TO hub_app;`);
  }
  p();
}

CADASTROS.forEach((t) => tabela(t, false));
MOVIMENTOS.forEach((t) => tabela(t, true));
process.stdout.write(saida.join('\n') + '\n');
