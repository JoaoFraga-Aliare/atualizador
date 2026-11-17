import type { ParametroDef } from './parametros';

// PDVCONFIG2 (lnws-pdvconfig2.p do Agrosys): a linha tp-caixa que o ERP devolve com os parametros do caixa que ele
// conhece. Aqui fica o de -> para dos nomes do ERP (pdv_*, cfg_*) para as colunas da tabela caixa do PDV.
// O que a LN nao devolve continua manual, como sempre foi (tela de parametros do caixa).
export type TipoCampo = 'texto' | 'inteiro' | 'decimal' | 'booleano' | 'data';

export type MapaCampo = { de: string; para: string; tipo: TipoCampo; rotulo: string; digitos?: boolean };

const m = (de: string, para: string, tipo: TipoCampo, rotulo: string, digitos = false): MapaCampo => ({ de, para, tipo, rotulo, digitos });

export const mapaPdvConfig2: readonly MapaCampo[] = [
  // emitente (filial)
  m('con_razsoc', 'con_razsoc', 'texto', 'Razão social'),
  m('con_cnpj', 'con_cnpj', 'texto', 'CNPJ', true),
  m('con_inscest', 'con_inscest', 'texto', 'Inscrição estadual'),
  m('con_fantasia', 'con_fantasia', 'texto', 'Nome fantasia'),
  m('con_cep', 'con_cep', 'texto', 'CEP', true),
  m('con_endereco', 'con_endereco', 'texto', 'Endereço'),
  m('con_numendereco', 'con_numendereco', 'texto', 'Número'),
  m('con_uf', 'con_uf', 'texto', 'UF'),
  m('con_bainome', 'con_bainome', 'texto', 'Bairro'),
  m('cid_cidade', 'cid_cidade', 'inteiro', 'Código IBGE da cidade'),
  m('con_cidnome', 'con_cidnome', 'texto', 'Cidade'),
  m('con_fone', 'con_fone', 'texto', 'Telefone'),
  // fiscal
  m('con_tpemis', 'con_tpemis', 'inteiro', 'Tipo de emissão'),
  m('con_csc', 'con_csc', 'texto', 'CSC'),
  m('con_idcsc', 'con_idcsc', 'texto', 'ID do CSC'),
  m('cai_consufinal', 'cai_consufinal', 'inteiro', 'Consumidor final'),
  m('cai_excicmsbasepis', 'cai_excicmsbasepis', 'booleano', 'Exclui ICMS da base do PIS'),
  m('cai_excicmsbasecof', 'cai_excicmsbasecof', 'booleano', 'Exclui ICMS da base da COFINS'),
  m('cai_icmspordentro', 'cai_icmspordentro', 'booleano', 'ICMS por dentro'),
  m('pdv_tipoperacao', 'tip_operacao', 'inteiro', 'Operação do terminal'),
  m('pdv_versaodf', 'cai_versaodf', 'inteiro', 'Versão do documento fiscal'),
  m('pdv_nfce', 'con_nfce', 'booleano', 'Emite NFC-e'),
  // reforma tributaria e deflator
  m('cai_dtinivigencia', 'cai_dtinivigencia', 'data', 'Reforma: início da vigência'),
  m('cai_dtinitotal', 'cai_dtinitotal', 'data', 'Reforma: acúmulo do total da nota'),
  m('cai_dtinientegov', 'cai_dtinientegov', 'data', 'Reforma: início ente governamental'),
  m('cai_dtfimentegov', 'cai_dtfimentegov', 'data', 'Reforma: fim ente governamental'),
  m('cai_defltipocalc', 'cai_defltipocalc', 'inteiro', 'Deflator: tipo de cálculo'),
  m('cai_deflhierarquia', 'cai_deflhierarquia', 'inteiro', 'Deflator: hierarquia'),
  m('dfv_pcmes', 'dfv_pcmes', 'decimal', '% Deflator'),
  m('pco_decracr', 'pco_decracr', 'booleano', 'Deflator: decréscimo/acréscimo'),
  // responsavel tecnico
  m('cai_cnpjresptec', 'cai_cnpjresp', 'texto', 'Resp. técnico: CNPJ'),
  m('pdv_contatoresptec', 'cai_contatoresp', 'texto', 'Resp. técnico: contato'),
  m('pdv_emailresp', 'cai_emailresp', 'texto', 'Resp. técnico: e-mail'),
  m('pdv_foneresp', 'cai_foneresp', 'texto', 'Resp. técnico: telefone'),
  // so na PDVCONFIG (lnws-pdvconfig): ja vem com o nome da coluna do PDV
  m('cai_cnpjresp', 'cai_cnpjresp', 'texto', 'Resp. técnico: CNPJ'),
  m('cai_contatoresp', 'cai_contatoresp', 'texto', 'Resp. técnico: contato'),
  m('cai_emailresp', 'cai_emailresp', 'texto', 'Resp. técnico: e-mail'),
  m('cai_foneresp', 'cai_foneresp', 'texto', 'Resp. técnico: telefone'),
  m('cai_csrt', 'cai_csrt', 'texto', 'CSRT'),
  m('cai_idcsrt', 'cai_idcsrt', 'inteiro', 'ID do CSRT'),
  m('cai_preduf', 'cai_preduf', 'decimal', 'Redutor ente governamental: UF'),
  m('cai_predum', 'cai_predum', 'decimal', 'Redutor ente governamental: município'),
  m('cai_predue', 'cai_predue', 'decimal', 'Redutor ente governamental: estado'),
  // comportamento do PDV (pdv-config)
  m('pdv_loja', 'cai_loja', 'inteiro', 'Loja'),
  m('pdv_boasvindas', 'cai_boasvindas', 'texto', 'Mensagem de boas-vindas'),
  m('pdv_obsnf', 'cai_obsnf', 'texto', 'Observação da nota'),
  m('pdv_acresqtprod', 'cai_acresqtprod', 'booleano', 'Acrescenta quantidade do produto'),
  m('pdv_alertasan', 'cai_alertasan', 'decimal', 'Alerta de sangria'),
  m('pdv_limitesan', 'cai_limitesan', 'decimal', 'Limite de sangria'),
  m('pdv_altcliabre', 'cai_altcliabre', 'booleano', 'Altera cliente com venda aberta'),
  m('pdv_altcpgabre', 'cai_altcpgabre', 'booleano', 'Altera condição com venda aberta'),
  m('pdv_atucliaut', 'con_atucliaut', 'booleano', 'Atualiza cliente automaticamente'),
  m('pdv_atuxmlass', 'con_atuxmlass', 'booleano', 'Atualiza XML assinado'),
  m('pdv_bloestzero', 'cai_bloestzero', 'booleano', 'Bloqueia estoque zerado'),
  m('pdv_bloqlimcred', 'con_bloqlimcred', 'booleano', 'Bloqueia limite de crédito'),
  m('pdv_compaprazo', 'con_compaprazo', 'booleano', 'Compra a prazo'),
  m('pdv_consideralote', 'cai_consideralote', 'booleano', 'Considera lote'),
  m('pdv_controleoper', 'cai_controleoper', 'booleano', 'Controle de operador'),
  m('pdv_cpfconsum', 'cai_cpfconsum', 'booleano', 'CPF do consumidor'),
  m('pdv_cpgavista', 'cai_cpg_vista', 'texto', 'Condição à vista'),
  m('pdv_desccomercial', 'cai_desccomercial', 'booleano', 'Desconto comercial'),
  m('pdv_exclusivo', 'cai_exclusivo', 'booleano', 'Exclusivo'),
  m('pdv_expnfauto', 'cai_expnfauto', 'booleano', 'Exporta nota automaticamente'),
  m('pdv_hidebonif', 'cai_hidebonif', 'booleano', 'Oculta bonificação'),
  m('pdv_impcompvenda', 'con_impcompvenda', 'booleano', 'Imprime comprovante de venda'),
  m('pdv_mosrestricao', 'con_mosrestricao', 'booleano', 'Mostra restrição'),
  m('pdv_pcdesclib', 'cai_pcdesclib', 'decimal', '% de desconto liberado'),
  m('pdv_preocorre', 'cai_preocorre', 'booleano', 'Preço por ocorrência'),
  m('pdv_qtdigualpeso', 'cai_qtdigualpeso', 'booleano', 'Quantidade igual ao peso'),
  m('pdv_qtmult', 'cai_qtmult', 'booleano', 'Quantidade múltipla'),
  m('pdv_receita', 'cai_receita', 'booleano', 'Receita'),
  m('pdv_reimprime', 'cai_reimprime', 'booleano', 'Reimprime'),
  m('pdv_subscreveite', 'cai_subscreveite', 'booleano', 'Substitui item'),
  m('pdv_tabprepad', 'cai_tabprepad', 'inteiro', 'Tabela de preço padrão'),
  m('pdv_tolerancia', 'cai_tolerancia', 'decimal', 'Tolerância'),
  m('pdv_urlsoapvr12', 'cai_urlsoapvr12', 'booleano', 'URL SOAP (versão 12)'),
  m('pdv_vendecliinat', 'cai_vendecliinat', 'booleano', 'Vende para cliente inativo'),
  m('pdv_vendedorpad', 'cai_vendedorpad', 'inteiro', 'Vendedor padrão'),
  m('pdv_vlminprazo', 'cai_vlminprazo', 'decimal', 'Valor mínimo a prazo'),
  m('pdv_convfunc', 'pdv_convfunc', 'booleano', 'Convênio de funcionário'),
  m('pdv_sincrononfce', 'pdv_sincrononfce', 'booleano', 'NFC-e síncrona'),
  m('pdv_sincrononfe', 'pdv_sincrononfe', 'booleano', 'NF-e síncrona'),
  m('pdv_usasaldovoucher', 'pdv_usasaldovoucher', 'booleano', 'Usa saldo de voucher'),
  m('pdv_prevolume', 'pdv_prevolume', 'booleano', 'Preço por volume'),
  m('pdv_prepromo', 'pdv_prepromo', 'booleano', 'Preço promocional'),
  m('pdv_loginws', 'pdv_loginws', 'booleano', 'Login pelo web service'),
  // e-mail de envio (a senha nao vem: ver ignoradosPdvConfig2)
  m('cfg_smtp', 'con_emailsmtp', 'texto', 'E-mail: servidor SMTP'),
  m('cfg_porta', 'con_emailporta', 'inteiro', 'E-mail: porta'),
  m('cfg_smtpseguro', 'con_emaismtpseguro', 'texto', 'E-mail: SMTP seguro'),
  m('cfg_email', 'con_email', 'texto', 'E-mail: remetente'),
  m('cfg_nome', 'con_emailnome', 'texto', 'E-mail: nome do remetente'),
  m('cfg_destinatario', 'con_emaildest', 'texto', 'E-mail: destinatário'),
  m('cfg_emailcopia', 'con_emailcopia', 'texto', 'E-mail: com cópia'),
  m('cfg_assunto', 'con_emailassunto', 'texto', 'E-mail: assunto'),
  m('cfg_mensagem', 'con_emailmensagem', 'texto', 'E-mail: mensagem'),
];

// Campos que a LN devolve e o Hub NAO grava como parametro.
export const ignoradosPdvConfig2: Record<string, string> = {
  con_certsenha: 'certificado: vai pelo download cifrado',
  con_certnome: 'certificado: vai pelo download cifrado',
  con_urlcertificado: 'certificado: vai pelo download cifrado',
  cfg_senha: 'senha do e-mail: informar manualmente',
  pdv_aceitadesc: 'sem coluna correspondente no PDV',
  pdv_fatura: 'sem coluna correspondente no PDV',
};

// Definicoes dos destinos que a tela de parametros ainda nao tinha (grupo "Agrosys"): sem elas o Hub recusaria o campo.
export function extrasDoAgrosys(existentes: ReadonlySet<string>): ParametroDef[] {
  return mapaPdvConfig2
    .filter((c) => !existentes.has(c.para))
    .map((c) => ({
      campo: c.para, rotulo: c.rotulo, grupo: 'Agrosys', largura: 33, origem: 'agrosys' as const,
      controle: c.tipo === 'booleano' ? 'booleano' : c.tipo === 'data' ? 'data' : 'texto',
      tipo: c.tipo,
    }));
}
