'use server';

import { revalidatePath } from 'next/cache';
import { parametros, type Origem } from '@hub/contracts';
import { api, textoDoErro } from '@/lib/api';

export type Estado = { erro?: string; ok?: string; codigo?: string };

const texto = (d: FormData, k: string) => String(d.get(k) ?? '').trim();

// Padroes de conexao do Agrosys (cadastro da empresa), vindos do formulario.
function padroesDoForm(d: FormData): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  const url = texto(d, 'con_sincurl');
  if (url) p.con_sincurl = url;
  for (const c of ['emp_empresa', 'uni_unidade', 'fil_filial', 'cai_timeout']) {
    const v = texto(d, c);
    if (v !== '') p[c] = Number(v);
  }
  p.cai_urlsoapvr12 = d.get('cai_urlsoapvr12') === 'on';
  return p;
}

export async function criarTenant(_: Estado, d: FormData): Promise<Estado> {
  const origem = texto(d, 'origem') as Origem;
  try {
    await api('/v1/tenants', {
      method: 'POST',
      corpo: {
        nome: texto(d, 'nome'), documento: texto(d, 'documento') || undefined, origem,
        padroes: origem === 'agrosys' ? padroesDoForm(d) : undefined,
      },
    });
  } catch (e) { return { erro: textoDoErro(e) }; }
  revalidatePath('/tenants');
  return { ok: 'Empresa criada.' };
}

export async function salvarPadroes(tenantId: string, _: Estado, d: FormData): Promise<Estado> {
  try {
    await api(`/v1/tenants/${tenantId}/padroes`, { method: 'PUT', corpo: { padroes: padroesDoForm(d) } });
  } catch (e) { return { erro: textoDoErro(e) }; }
  revalidatePath(`/tenants/${tenantId}`);
  return { ok: 'Padrões de conexão salvos. Os terminais passam a usá-los.' };
}

export async function criarTerminal(tenantId: string, _: Estado, d: FormData): Promise<Estado> {
  try {
    const r = await api<{ token: string }>(`/v1/tenants/${tenantId}/terminals`, {
      method: 'POST',
      corpo: { nome: texto(d, 'nome'), codigoLegado: texto(d, 'codigoLegado') || undefined },
    });
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: 'Terminal criado. Copie o token e configure no Integrador: ele aparece só agora.', codigo: r.token };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

// Cria um terminal novo com os parâmetros do caixa copiados de outro.
export async function replicarTerminal(tenantId: string, origemId: string, _: Estado, d: FormData): Promise<Estado> {
  try {
    const r = await api<{ token: string }>(`/v1/tenants/${tenantId}/terminals`, {
      method: 'POST',
      corpo: { nome: texto(d, 'nome'), codigoLegado: texto(d, 'codigoLegado') || undefined, copiarDe: origemId },
    });
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: 'Terminal replicado com os mesmos parâmetros. Copie o token e configure no Integrador: ele aparece só agora.', codigo: r.token };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

export async function gerarTokenTerminal(tenantId: string, terminalId: string, _: Estado): Promise<Estado> {
  try {
    const r = await api<{ token: string }>(`/v1/tenants/${tenantId}/terminals/${terminalId}/token`, { method: 'POST', corpo: {} });
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: 'Token anterior revogado. Novo token (aparece só agora):', codigo: r.token };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

export async function criarUsuarioIntegracao(tenantId: string, _: Estado, d: FormData): Promise<Estado> {
  try {
    await api(`/v1/tenants/${tenantId}/users`, {
      method: 'POST',
      corpo: { nome: texto(d, 'nome'), email: texto(d, 'email'), senha: String(d.get('senha') ?? ''), papel: 'integracao' },
    });
  } catch (e) { return { erro: textoDoErro(e) }; }
  return { ok: 'Usuário de integração criado.' };
}

// Parâmetros do caixa: grava os campos exibidos no formulário (lista `campos`).
// Vazio limpa o campo (volta a herdar o padrão da empresa, quando houver).
export async function salvarConfigTerminal(tenantId: string, terminalId: string, _: Estado, d: FormData): Promise<Estado> {
  const valores: Record<string, string | number | boolean | null> = {};
  for (const campo of d.getAll('campos').map(String)) {
    const def = parametros.find((p) => p.campo === campo);
    if (!def) continue;
    const bruto = String(d.get(`p__${campo}`) ?? '').trim();
    if (def.tipo === 'booleano') { valores[campo] = d.get(`p__${campo}`) === 'on'; continue; }
    if (bruto === '') { valores[campo] = null; continue; }
    const numerico = def.tipo === 'inteiro' || def.tipo === 'decimal' || def.controle === 'minmax' || def.valorPorIndice;
    valores[campo] = numerico ? Number(bruto) : bruto;
  }
  try {
    const r = await api<{ versao: number; mudou: boolean }>(`/v1/tenants/${tenantId}/terminals/${terminalId}/config`,
      { method: 'PUT', corpo: { valores } });
    revalidatePath(`/tenants/${tenantId}/terminais/${terminalId}`);
    return { ok: r.mudou ? `Salvo (versão ${r.versao}). O terminal recebe na próxima sincronização.` : 'Nada mudou.' };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

// Exclui o terminal (token e parâmetros dele deixam de existir).
export async function excluirTerminal(tenantId: string, terminalId: string): Promise<Estado> {
  try {
    await api(`/v1/tenants/${tenantId}/terminals/${terminalId}`, { method: 'DELETE' });
  } catch (e) { return { erro: textoDoErro(e) }; }
  revalidatePath(`/tenants/${tenantId}`);
  return { ok: 'Terminal excluído.' };
}

// Sincronizar agora (origem Agrosys): o Hub busca tudo no ERP e grava a diferença.
export async function sincronizarAgora(tenantId: string, _: Estado): Promise<Estado> {
  try {
    const r = await api<{ resultados: { entidade: string; lidas: number; mudadas: number; erro?: string }[] }>(
      `/v1/tenants/${tenantId}/sync`, { method: 'POST', corpo: {} });
    revalidatePath(`/tenants/${tenantId}`);
    const mudadas = r.resultados.reduce((s, x) => s + x.mudadas, 0);
    const erros = r.resultados.filter((x) => x.erro);
    return erros.length
      ? { erro: `${r.resultados.length - erros.length} entidade(s) ok, ${mudadas} linha(s) alterada(s). Com erro: ${erros.map((x) => `${x.entidade} (${x.erro})`).join('; ')}` }
      : { ok: `${r.resultados.length} entidades sincronizadas, ${mudadas} linha(s) alterada(s).` };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

export async function reenviarEnvio(tenantId: string, envioId: number, _: Estado): Promise<Estado> {
  try {
    const r = await api<{ status: string }>(`/v1/tenants/${tenantId}/outbox/${envioId}/reenviar`, { method: 'POST', corpo: {} });
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: `Envio ${envioId}: ${r.status}.` };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

// Detalhe de uma requisição do log (com o conteúdo, enquanto não expirou).
export async function buscarLog(tenantId: string, logId: number) {
  try {
    return await api<import('@/components/LogDetalhe').DetalheLog>(`/v1/tenants/${tenantId}/logs/${logId}`);
  } catch (e) { return { erro: textoDoErro(e) }; }
}

// Chaves de API da empresa (origem API): a chave completa só aparece ao criar.
export async function criarChaveApi(tenantId: string, _: Estado, d: FormData): Promise<Estado> {
  try {
    const r = await api<{ chave: string }>(`/v1/tenants/${tenantId}/api-keys`, { method: 'POST', corpo: { nome: texto(d, 'nome') } });
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: 'Chave criada. Copie agora: ela não será mostrada de novo.', codigo: r.chave };
  } catch (e) { return { erro: textoDoErro(e) }; }
}

export async function revogarChaveApi(tenantId: string, chaveId: string, _: Estado): Promise<Estado> {
  try {
    await api(`/v1/tenants/${tenantId}/api-keys/${chaveId}`, { method: 'DELETE' });
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: 'Chave revogada.' };
  } catch (e) { return { erro: textoDoErro(e) }; }
}
