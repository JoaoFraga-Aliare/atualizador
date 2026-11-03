// Diagnostico de um Hub no ar (piloto em loja real): confere saude, login, empresa, terminal, parametros, certificado,
// sincronizacao, envios, erros e alertas, e diz o que esta OK, o que merece atencao e o que falhou.
// Somente leitura: nao grava nada (a previa dos parametros do Agrosys usa aplicar:false).
//   npm run diagnostico -w @hub/api      (variaveis HUB_URL, HUB_EMAIL, HUB_SENHA; opcionais HUB_EMPRESA, HUB_TERMINAL_TOKEN)

export type Nivel = 'ok' | 'atencao' | 'falha';
export type Resultado = { nivel: Nivel; item: string; detalhe: string };
export type Opcoes = { url: string; email?: string; senha?: string; empresa?: string; terminalToken?: string; jwt?: string };

type Resp = { status: number; corpo: any; ms: number };

export async function diagnosticar(o: Opcoes): Promise<Resultado[]> {
  const base = o.url.replace(/\/$/, '');
  const out: Resultado[] = [];
  const add = (nivel: Nivel, item: string, detalhe: string) => out.push({ nivel, item, detalhe });
  const chamar = async (metodo: string, caminho: string, token?: string, corpo?: unknown): Promise<Resp> => {
    const t0 = Date.now();
    try {
      const r = await fetch(base + caminho, {
        method: metodo, signal: AbortSignal.timeout(20_000),
        headers: { 'content-type': 'application/json', referer: 'postman', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      return { status: r.status, corpo: await r.json().catch(() => null), ms: Date.now() - t0 };
    } catch (e) { return { status: 0, corpo: { erro: (e as Error).message }, ms: Date.now() - t0 }; }
  };

  // 1. saude
  const saude = await chamar('GET', '/health');
  if (saude.status !== 200) { add('falha', 'Hub no ar', `Sem resposta em ${base}/health (${saude.corpo?.erro ?? `HTTP ${saude.status}`}).`); return out; }
  add(saude.ms > 1500 ? 'atencao' : 'ok', 'Hub no ar', `Respondeu em ${saude.ms} ms (banco incluso).`);

  // 2. credencial de usuario
  let jwt = o.jwt;
  if (!jwt && o.email && o.senha) {
    const l = await chamar('POST', '/v1/auth/login', undefined, { email: o.email, senha: o.senha });
    if (l.status === 200) { jwt = l.corpo.token; add('ok', 'Login', `Entrou como ${l.corpo.usuario?.nome ?? o.email}.`); }
    else add('falha', 'Login', l.status === 429 ? 'Bloqueado por muitas tentativas: aguarde alguns minutos.' : 'E-mail ou senha recusados.');
  }
  if (!jwt) { add('atencao', 'Gerencial', 'Sem usuario do Hub informado: so os testes sem login foram feitos.'); }

  // 3. empresa
  let tenantId = o.empresa;
  if (jwt) {
    const me = await chamar('GET', '/v1/me', jwt);
    const tenants: { id: string; nome: string; origem: string }[] = me.corpo?.tenants ?? [];
    if (!tenants.length) add('atencao', 'Empresas', 'O usuario nao enxerga nenhuma empresa.');
    else {
      const t = tenants.find((x) => x.id === tenantId || x.nome === tenantId) ?? (tenantId ? undefined : tenants[0]);
      if (!t) add('falha', 'Empresa', `Empresa "${tenantId}" nao encontrada entre as ${tenants.length} do usuario.`);
      else {
        tenantId = t.id;
        add('ok', 'Empresa', `${t.nome} (origem ${t.origem === 'agrosys' ? 'Agrosys' : 'API'}).`);
        await empresa(t);
      }
    }
  }

  async function empresa(t: { id: string; nome: string; origem: string }) {
    const T = `/v1/tenants/${t.id}`;
    // terminais e conexao
    const con = await chamar('GET', `${T}/conexao`, jwt);
    const terms: any[] = con.corpo?.terminais ?? [];
    if (!terms.length) add('falha', 'Terminais', 'Nenhum terminal cadastrado.');
    for (const x of terms) {
      const quando = x.ultimo_contato ? `ultimo contato ${new Date(x.ultimo_contato).toLocaleString('pt-BR')}` : 'nunca conectou';
      const amb = x.ambiente === 'producao' ? 'producao' : 'homologacao';
      if (!x.ativo) add('atencao', `Terminal ${x.nome}`, `Desativado (${amb}).`);
      else if (x.conexao === 'online') add('ok', `Terminal ${x.nome}`, `Online, ${amb}; ${x.requisicoes_24h} req e ${x.erros_24h} erro(s) em 24 h.`);
      else add(x.conexao === 'nunca' ? 'atencao' : 'falha', `Terminal ${x.nome}`, `${x.conexao}, ${amb}: ${quando}.`);
    }
    if (con.corpo?.erp?.erros_24h > 0) add('atencao', 'Agrosys', `${con.corpo.erp.erros_24h} falha(s) de comunicacao em 24 h (de ${con.corpo.erp.chamadas_24h} chamadas).`);
    else if (t.origem === 'agrosys') add('ok', 'Agrosys', `${con.corpo?.erp?.chamadas_24h ?? 0} chamada(s) em 24 h, sem falha.`);

    // prontidao (checklist de homologacao)
    const pr = await chamar('GET', `${T}/prontidao`, jwt);
    if (pr.status === 200) {
      const faltam = (pr.corpo.itens as any[]).filter((i) => i.obrigatorio && !i.ok);
      if (!faltam.length) add('ok', 'Pre-requisitos de venda', `Todos os ${pr.corpo.obrigatorios} itens obrigatorios atendidos.`);
      else add('falha', 'Pre-requisitos de venda', `Faltam ${faltam.length} de ${pr.corpo.obrigatorios}: ${faltam.map((i) => `${i.titulo}${i.detalhe ? ` (${i.detalhe})` : ''}`).join('; ')}`);
    }

    // certificado
    const ce = await chamar('GET', `${T}/certificado`, jwt);
    if (ce.corpo?.existe) {
      const dias = ce.corpo.dias_restantes ?? Math.floor((new Date(ce.corpo.valido_ate).getTime() - Date.now()) / 86_400_000);
      add(dias < 0 ? 'falha' : dias < 30 ? 'atencao' : 'ok', 'Certificado digital', `${ce.corpo.titular ?? 'A1'}: ${dias < 0 ? `vencido ha ${-dias} dia(s)` : `vence em ${dias} dia(s)`}.`);
    } else add('falha', 'Certificado digital', 'Nenhum certificado enviado ao Hub.');

    // parametros do Agrosys (previa, sem gravar)
    if (t.origem === 'agrosys' && terms[0]) {
      const p = await chamar('POST', `${T}/terminals/${terms[0].id}/config/agrosys`, jwt, { aplicar: false });
      if (p.status === 200) {
        add('ok', 'Parametros do Agrosys', `Previa ok: ${p.corpo.mudancas.length} campo(s) diferente(s), ${p.corpo.semMudanca} igual(is).`);
        if (p.corpo.faltando?.length) add('atencao', 'Cadastros faltando no Agrosys', p.corpo.faltando.join('; '));
        if (p.corpo.recusados?.length) add('atencao', 'Valores recusados', p.corpo.recusados.map((x: any) => `${x.campo} (${x.erro})`).join('; '));
      } else add('falha', 'Parametros do Agrosys', String(p.corpo?.erro ?? `HTTP ${p.status}`));
    }

    // sincronizacao e envios
    const ss = await chamar('GET', `${T}/sync-status`, jwt);
    if (ss.status === 200 && t.origem === 'agrosys') {
      const comErro = (Array.isArray(ss.corpo) ? ss.corpo : []).filter((r: any) => r.erro);
      add(comErro.length ? 'atencao' : 'ok', 'Sincronizacao com o Agrosys', comErro.length ? `${comErro.length} entidade(s) com erro: ${comErro.slice(0, 5).map((r: any) => `${r.entidade} (${String(r.erro).slice(0, 60)})`).join('; ')}` : 'Ultimas cargas sem erro.');
    }
    const ob = await chamar('GET', `${T}/outbox/resumo`, jwt);
    if (ob.status === 200) {
      const r: Record<string, number> = {};
      for (const e of Array.isArray(ob.corpo) ? ob.corpo : []) r[e.status] = (r[e.status] ?? 0) + 1;
      const ruim = (r.pendente ?? 0) + (r.erro ?? 0) + (r.recusado ?? 0);
      add(ruim ? 'atencao' : 'ok', 'Envios do PDV (ultimos 30)', `enviados ${r.enviado ?? 0}, pendentes ${r.pendente ?? 0}, com erro ${r.erro ?? 0}, recusados ${r.recusado ?? 0}.`);
    }
    const lg = await chamar('GET', `${T}/logs?resultado=falha&limite=5`, jwt);
    if (Array.isArray(lg.corpo) && lg.corpo.length) add('atencao', 'Erros recentes', lg.corpo.map((l: any) => `${l.operacao ?? l.rota}: ${l.mensagem ?? l.resultado}`).slice(0, 3).join(' | '));
  }

  // 4. alertas (administrador)
  if (jwt) {
    const al = await chamar('GET', '/v1/admin/alertas', jwt);
    if (al.status === 200) add(al.corpo.abertos.length ? 'atencao' : 'ok', 'Alertas do Hub', al.corpo.abertos.length ? `${al.corpo.abertos.length} aberto(s): ${al.corpo.abertos.slice(0, 3).map((a: any) => a.titulo).join(' | ')}` : 'Nenhum alerta aberto.');
  }

  // 5. do ponto de vista do terminal (token tk_)
  if (o.terminalToken) {
    const ping = await chamar('POST', '/v1/terminal/ping', o.terminalToken, {});
    if (ping.status !== 200) add('falha', 'Token do terminal', ping.status === 401 ? 'Token invalido, revogado ou terminal desativado.' : `HTTP ${ping.status}`);
    else {
      add('ok', 'Token do terminal', `${ping.corpo.terminal} - ${ping.corpo.empresa} - ${ping.corpo.ambiente === 'producao' ? 'PRODUCAO' : 'HOMOLOGACAO'}.`);
      const cfg = await chamar('GET', '/v1/terminal/config?desde=0', o.terminalToken);
      const tpamb = cfg.corpo?.valores?.con_tpamb;
      const esperado = ping.corpo.ambiente === 'producao' ? 1 : 2;
      add(tpamb === esperado ? 'ok' : 'falha', 'Ambiente da nota (con_tpamb)', `Hub entrega ${tpamb} (${tpamb === 1 ? 'producao' : 'homologacao'}); esperado ${esperado}.`);
      const v = cfg.corpo?.valores ?? {};
      const falta = ['con_cnpj', 'con_razsoc', 'con_serienfc', 'con_csc', 'con_idcsc', 'tip_operacao', 'cai_consufinal'].filter((c) => v[c] === undefined || v[c] === null || String(v[c]).trim() === '');
      add(falta.length ? 'falha' : 'ok', 'Parametros fiscais do caixa', falta.length ? `Faltam: ${falta.join(', ')}.` : 'Emitente, serie, CSC, operacao e consumidor final preenchidos.');
      const cert = await chamar('GET', '/v1/terminal/certificado?versao=0', o.terminalToken);
      add(cert.corpo?.existe ? 'ok' : 'falha', 'Certificado para o caixa', cert.corpo?.existe ? 'O terminal consegue baixar o certificado.' : 'O Hub nao tem certificado para este terminal.');
      for (const ent of ['products', 'customers', 'prices', 'taxes']) {
        const s = await chamar('GET', `/v1/sync/${ent}?desde=0&limite=1`, o.terminalToken);
        add(s.status === 200 && (s.corpo?.mudancas?.length ?? 0) > 0 ? 'ok' : 'falha', `Sync ${ent}`, s.status === 200 ? ((s.corpo?.mudancas?.length ?? 0) > 0 ? 'Ha dados para o caixa.' : 'Nenhum dado para este caixa.') : `HTTP ${s.status}`);
      }
    }
  }
  return out;
}

export const resumo = (r: Resultado[]) => ({ ok: r.filter((x) => x.nivel === 'ok').length, atencao: r.filter((x) => x.nivel === 'atencao').length, falha: r.filter((x) => x.nivel === 'falha').length });
