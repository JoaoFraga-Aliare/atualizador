// GERADO por scripts/gerar-parametros.mjs - nao editar.
import type { ParametroDef } from './parametros';

export const parametros: readonly ParametroDef[] = [
 {
  "campo": "cai_loja",
  "rotulo": "Loja",
  "grupo": "Geral",
  "bloco": "GERAL1",
  "largura": 15,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_nomeloja",
  "rotulo": "Nome Loja",
  "grupo": "Geral",
  "bloco": "GERAL1",
  "largura": 85,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_boasvindas",
  "rotulo": "Mensagem Boas-vindas",
  "grupo": "Geral",
  "largura": 100,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_diavinf",
  "rotulo": "Dia padrão \"VINF\"",
  "grupo": "Geral",
  "bloco": "GERAL2",
  "largura": 20,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_funtroco",
  "rotulo": "Fundo de Troco",
  "grupo": "Geral",
  "bloco": "GERAL2",
  "largura": 20,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_vendedorpad",
  "rotulo": "Vendedor Padrão",
  "grupo": "Geral",
  "bloco": "GERAL2",
  "largura": 20,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "dfv_pcmes",
  "rotulo": "% Deflator",
  "grupo": "Geral",
  "bloco": "GERAL2",
  "largura": 20,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_vlminprazo",
  "rotulo": "Valor Min Prazo",
  "grupo": "Geral",
  "bloco": "GERAL3",
  "largura": 20,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_cpg_vista",
  "rotulo": "Cond. Pag. \"À Vista\"",
  "grupo": "Geral",
  "bloco": "GERAL3",
  "largura": 20,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_avisofuncionario",
  "rotulo": "Aviso funcionário",
  "grupo": "Geral",
  "bloco": "GERAL3",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_controleoper",
  "rotulo": "Controle por operador",
  "grupo": "Geral",
  "bloco": "GERAL4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_desccomercial",
  "rotulo": "Desconto comercial",
  "grupo": "Geral",
  "bloco": "GERAL4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_altcpgabre",
  "rotulo": "Sugere inf. cond. pagto.",
  "grupo": "Geral",
  "bloco": "GERAL4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_telacriavenda",
  "rotulo": "Tela de criação de pedido",
  "grupo": "Geral",
  "bloco": "GERAL5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_parcelamento",
  "rotulo": "Permite parcelamento",
  "grupo": "Geral",
  "bloco": "GERAL6",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_sugereusu",
  "rotulo": "Sugere usuário",
  "grupo": "Geral",
  "bloco": "GERAL6",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_frete",
  "rotulo": "Habilita frete",
  "grupo": "Geral",
  "bloco": "GERAL6",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_fatsimples",
  "rotulo": "Faturamento Simples",
  "grupo": "Geral",
  "bloco": "GERAL6",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_cnpj",
  "rotulo": "CNPJ",
  "grupo": "Emitente",
  "bloco": "EMT1",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_inscest",
  "rotulo": "Insc.Est.",
  "grupo": "Emitente",
  "bloco": "EMT1",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_fone",
  "rotulo": "Fone",
  "grupo": "Emitente",
  "bloco": "EMT1",
  "largura": 34,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_razsoc",
  "rotulo": "Razão Social",
  "grupo": "Emitente",
  "bloco": "EMT2",
  "largura": 66,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_fantasia",
  "rotulo": "Fantasia",
  "grupo": "Emitente",
  "bloco": "EMT2",
  "largura": 34,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_cep",
  "rotulo": "CEP",
  "grupo": "Emitente",
  "bloco": "EMT3",
  "largura": 17,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_endereco",
  "rotulo": "Endereço",
  "grupo": "Emitente",
  "bloco": "EMT3",
  "largura": 66,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_numendereco",
  "rotulo": "Número",
  "grupo": "Emitente",
  "bloco": "EMT3",
  "largura": 17,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_compendereco",
  "rotulo": "Complemento",
  "grupo": "Emitente",
  "bloco": "EMT4",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_bainome",
  "rotulo": "Bairro",
  "grupo": "Emitente",
  "bloco": "EMT4",
  "largura": 67,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cid_cidade",
  "rotulo": "Cód. Cidade",
  "grupo": "Emitente",
  "bloco": "EMT5",
  "largura": 17,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "con_cidnome",
  "rotulo": "Cidade",
  "grupo": "Emitente",
  "bloco": "EMT5",
  "largura": 66,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_uf",
  "rotulo": "UF",
  "grupo": "Emitente",
  "bloco": "EMT5",
  "largura": 17,
  "controle": "lista",
  "tipo": "texto",
  "opcoes": [
   "AC",
   "AL",
   "AP",
   "AM",
   "BA",
   "CE",
   "DF",
   "ES",
   "GO",
   "MA",
   "MT",
   "MS",
   "MG",
   "PA",
   "PB",
   "PR",
   "PE",
   "PI",
   "RJ",
   "RN",
   "RS",
   "RO",
   "RR",
   "SC",
   "SP",
   "SE",
   "TO"
  ],
  "valorPorIndice": false
 },
 {
  "campo": "con_csc",
  "rotulo": "CSC (Chave de Segurança Contribuinte)",
  "grupo": "Emitente",
  "bloco": "EMT6",
  "largura": 83,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_idcsc",
  "rotulo": "ID CSC",
  "grupo": "Emitente",
  "bloco": "EMT6",
  "largura": 17,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_tabprepad",
  "rotulo": "Tab. Preço Padrão",
  "grupo": "Produto",
  "bloco": "P1",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "pco_decracr",
  "rotulo": "Decréscimo de Preço",
  "grupo": "Produto",
  "bloco": "P1",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_preocorre",
  "rotulo": "Preço por Ocorrência",
  "grupo": "Produto",
  "bloco": "P1",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_descontos",
  "rotulo": "Permite alterar Preço/Desconto",
  "grupo": "Produto",
  "bloco": "P2",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_qtdigualpeso",
  "rotulo": "Quantidade Igual Peso",
  "grupo": "Produto",
  "bloco": "P2",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_receita",
  "rotulo": "Informa Receituário",
  "grupo": "Produto",
  "bloco": "P2",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_subscreveite",
  "rotulo": "Sobrescrever item igual",
  "grupo": "Produto",
  "bloco": "P3",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_vendecliinat",
  "rotulo": "Permite venda cli. inat.",
  "grupo": "Produto",
  "bloco": "P3",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_consideralote",
  "rotulo": "Controle de Lote",
  "grupo": "Produto",
  "bloco": "P3",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_qtmult",
  "rotulo": "Qtd. Múltiplas",
  "grupo": "Produto",
  "bloco": "P4",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_bloestzero",
  "rotulo": "Bloquear Estoque Zero",
  "grupo": "Produto",
  "bloco": "P4",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_acresqtprod",
  "rotulo": "Produto igual (acrés.)",
  "grupo": "Produto",
  "bloco": "P4",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_exibepeso",
  "rotulo": "Exibir coluna peso",
  "grupo": "Produto",
  "bloco": "P4",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_alterarqtd",
  "rotulo": "Alterar quantidade",
  "grupo": "Produto",
  "bloco": "P4",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_saldomin",
  "rotulo": "Saldo mín. p/ consulta online",
  "grupo": "Produto",
  "bloco": "P5",
  "largura": 50,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_saldointervalo",
  "rotulo": "Intervalo fila de saldo (seg)",
  "grupo": "Produto",
  "bloco": "P5",
  "largura": 50,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_pcdesclib",
  "rotulo": "% Desconto Liberado",
  "grupo": "Produto",
  "bloco": "P6",
  "largura": 50,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_acrescmax",
  "rotulo": "Acréscimo máximo (%)",
  "grupo": "Produto",
  "bloco": "P6",
  "largura": 50,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_consufinal",
  "rotulo": "Consumidor Final",
  "grupo": "Cliente",
  "bloco": "CLI1",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_altcliabre",
  "rotulo": "Sugere Informar Cliente",
  "grupo": "Cliente",
  "bloco": "CLI1",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_atucliaut",
  "rotulo": "Atualizar Cliente Automático",
  "grupo": "Cliente",
  "bloco": "CLI1",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_cpfconsum",
  "rotulo": "Inf. CPF consumidor final",
  "grupo": "Cliente",
  "bloco": "CLI2",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_bloqlimcred",
  "rotulo": "Bloq. Limite Crédito",
  "grupo": "Cliente",
  "bloco": "CLI2",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_mosrestricao",
  "rotulo": "Mostra Restrição",
  "grupo": "Cliente",
  "bloco": "CLI2",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_direvento",
  "rotulo": "Diretório Evento",
  "grupo": "WebService",
  "bloco": "WEB2",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_dirnfe",
  "rotulo": "Diretório NF-e",
  "grupo": "WebService",
  "bloco": "WEB2",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_direpec",
  "rotulo": "Diretório EPEC",
  "grupo": "WebService",
  "bloco": "WEB2",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_urlsoapvr12",
  "rotulo": "Conexão SOAP Vr.12",
  "grupo": "WebService",
  "bloco": "WEB1",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano",
  "origem": "agrosys"
 },
 {
  "campo": "pdv_tpemisnfce",
  "rotulo": "Tipo de emissão NFC-e",
  "grupo": "WebService",
  "bloco": "WEB1",
  "largura": 33,
  "controle": "lista",
  "tipo": "texto",
  "opcoes": [
   "1 - Emissão Normal",
   "9 - Contingência Off-line NFC-e"
  ],
  "valorPorIndice": false
 },
 {
  "campo": "pdv_tpemisnfe",
  "rotulo": "Tipo de emissão NF-e",
  "grupo": "WebService",
  "bloco": "WEB3",
  "largura": 33,
  "controle": "lista",
  "tipo": "texto",
  "opcoes": [
   "1 - Emissão Normal",
   "4 - Contingência EPEC (Não Disponível)",
   "5 - Contingência FS-DA",
   "6 - Contingência SVC-AN",
   "7 - Contingência SVC-RS"
  ],
  "valorPorIndice": false
 },
 {
  "campo": "cai_motivocont",
  "rotulo": "Motivo contingência",
  "grupo": "WebService",
  "bloco": "WEB3",
  "largura": 33,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_datacont",
  "rotulo": "Início contingência",
  "grupo": "WebService",
  "bloco": "WEB3",
  "largura": 33,
  "controle": "data",
  "tipo": "data"
 },
 {
  "campo": "emp_empresa",
  "rotulo": "Empresa",
  "grupo": "Sincronização",
  "bloco": "SINC1",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "fil_filial",
  "rotulo": "Filial",
  "grupo": "Sincronização",
  "bloco": "SINC1",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "uni_unidade",
  "rotulo": "Unidade",
  "grupo": "Sincronização",
  "bloco": "SINC1",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "emp_empresa_hlg",
  "rotulo": "Empresa Homologação",
  "grupo": "Sincronização",
  "bloco": "SINC2",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "fil_filial_hlg",
  "rotulo": "Filial Homologação",
  "grupo": "Sincronização",
  "bloco": "SINC2",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "uni_unidade_hlg",
  "rotulo": "Unidade Homologação",
  "grupo": "Sincronização",
  "bloco": "SINC2",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "emp_empresa_cx",
  "rotulo": "Empresa Caixa",
  "grupo": "Sincronização",
  "bloco": "SINC3",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "fil_filial_cx",
  "rotulo": "Filial Caixa",
  "grupo": "Sincronização",
  "bloco": "SINC3",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "uni_unidade_cx",
  "rotulo": "Unidade Caixa",
  "grupo": "Sincronização",
  "bloco": "SINC3",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "con_sincurl",
  "rotulo": "URL",
  "grupo": "Sincronização",
  "bloco": "SINC6",
  "largura": 70,
  "controle": "texto",
  "tipo": "texto",
  "origem": "agrosys"
 },
 {
  "campo": "cai_timeout",
  "rotulo": "Espera (ms)",
  "grupo": "Sincronização",
  "bloco": "SINC6",
  "largura": 30,
  "controle": "texto",
  "tipo": "inteiro",
  "origem": "agrosys"
 },
 {
  "campo": "pdv_integranova",
  "rotulo": "Sincronização Padrão Novo",
  "grupo": "Sincronização",
  "bloco": "SINC4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_expnfauto",
  "rotulo": "Exportar NF-e Automát.",
  "grupo": "Sincronização",
  "bloco": "SINC4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_soatendimento",
  "rotulo": "Apenas atendimento",
  "grupo": "Sincronização",
  "bloco": "SINC4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_exportapedido",
  "rotulo": "Exporta pedido",
  "grupo": "Sincronização",
  "bloco": "SINC5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_perguntafat",
  "rotulo": "Pergunta Faturamento",
  "grupo": "Sincronização",
  "bloco": "SINC5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_sincsangriasup",
  "rotulo": "Sangria e suprimentos",
  "grupo": "Sincronização",
  "bloco": "SINC5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_balanca",
  "rotulo": "Capturar Balança",
  "grupo": "Balança",
  "bloco": "BAL1",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "bal_modelo",
  "rotulo": "Modelo - Balança",
  "grupo": "Balança",
  "bloco": "BAL1",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "listaDoDispositivo": true
 },
 {
  "campo": "bal_porta",
  "rotulo": "Porta Serial",
  "grupo": "Balança",
  "bloco": "BAL1",
  "largura": 33,
  "controle": "lista",
  "tipo": "texto",
  "listaDoDispositivo": true
 },
 {
  "campo": "bal_baud",
  "rotulo": "Baud rate",
  "grupo": "Balança",
  "bloco": "BAL2",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "110",
   "300",
   "600",
   "1200",
   "2400",
   "4800",
   "9600",
   "14400",
   "19200",
   "38400",
   "56000",
   "57600",
   "115200"
  ],
  "valorPorIndice": false
 },
 {
  "campo": "bal_data",
  "rotulo": "Data Bits",
  "grupo": "Balança",
  "bloco": "BAL2",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "5",
   "6",
   "7",
   "8"
  ],
  "valorPorIndice": false
 },
 {
  "campo": "bal_parity",
  "rotulo": "Parity",
  "grupo": "Balança",
  "bloco": "BAL2",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "None",
   "Odd",
   "Even",
   "Mark",
   "Space"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "bal_handshake",
  "rotulo": "Handshaking",
  "grupo": "Balança",
  "bloco": "BAL3",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "Nenhum",
   "XON/XOFF",
   "RTS/CTS",
   "DSR/DTR"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "bal_stop",
  "rotulo": "Stop Bits",
  "grupo": "Balança",
  "bloco": "BAL3",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "1",
   "1.5",
   "2"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "bal_cargamod",
  "rotulo": "Modelo - Carga Balança",
  "grupo": "Balança",
  "bloco": "BAL3",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "listaDoDispositivo": true
 },
 {
  "campo": "cai_capturaps",
  "rotulo": "Capturar Peso Balança",
  "grupo": "Balança",
  "bloco": "BAL4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_pdv",
  "rotulo": "Monitorar Balança",
  "grupo": "Balança",
  "bloco": "BAL4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_balapenaskg",
  "rotulo": "Apenas por KG",
  "grupo": "Balança",
  "bloco": "BAL4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "ean_utiliza",
  "rotulo": "Utiliza padrão EAN13",
  "grupo": "Balança",
  "bloco": "BAL5",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "ean_codificacao",
  "rotulo": "Codificação EAN13",
  "grupo": "Balança",
  "bloco": "BAL5",
  "largura": 20,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "bal_timeout",
  "rotulo": "TimeOut",
  "grupo": "Balança",
  "bloco": "BAL5",
  "largura": 20,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "bal_tolerancia",
  "rotulo": "Tolerância",
  "grupo": "Balança",
  "bloco": "BAL5",
  "largura": 20,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "bal_arqlog",
  "rotulo": "Arquivo Log",
  "grupo": "Balança",
  "bloco": "BAL5",
  "largura": 20,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "tip_operacao",
  "rotulo": "Tipo Operação",
  "grupo": "Fiscal",
  "bloco": "FISCAL",
  "largura": 20,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "con_certcaminho",
  "rotulo": "Caminho Certificado",
  "grupo": "Fiscal",
  "bloco": "FISCAL",
  "largura": 50,
  "controle": "arquivo",
  "tipo": "texto",
  "extensoes": ".pfx"
 },
 {
  "campo": "con_certsenha",
  "rotulo": "Senha Certificado",
  "grupo": "Fiscal",
  "bloco": "FISCAL",
  "largura": 30,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_nfce",
  "rotulo": "NF Consumidor",
  "grupo": "Fiscal",
  "bloco": "GERAL5",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_cfopporunidade",
  "rotulo": "CFOP por Unidade",
  "grupo": "Fiscal",
  "bloco": "GERAL5",
  "largura": 20,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_impressora",
  "rotulo": "Impressora NFC-e",
  "grupo": "Impressão",
  "bloco": "IMP1",
  "largura": 33,
  "controle": "lista",
  "tipo": "texto",
  "listaDoDispositivo": true
 },
 {
  "campo": "con_impressoraaux",
  "rotulo": "Impressora NF-e",
  "grupo": "Impressão",
  "bloco": "IMP1",
  "largura": 33,
  "controle": "lista",
  "tipo": "texto",
  "listaDoDispositivo": true
 },
 {
  "campo": "cai_impmodelo",
  "rotulo": "Modelo - Impressora",
  "grupo": "Impressão",
  "bloco": "IMP1",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "listaDoDispositivo": true
 },
 {
  "campo": "cai_impbaudrate",
  "rotulo": "Baud rate",
  "grupo": "Impressão",
  "bloco": "IMP2",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_tempoimpress",
  "rotulo": "T. Resposta",
  "grupo": "Impressão",
  "bloco": "IMP2",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_escalanfe",
  "rotulo": "Escala NF-e",
  "grupo": "Impressão",
  "bloco": "IMP3",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_escalanfce",
  "rotulo": "Escala NFC-e",
  "grupo": "Impressão",
  "bloco": "IMP3",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "pdv_linhasavanco",
  "rotulo": "Linhas de avanço",
  "grupo": "Impressão",
  "bloco": "IMP2",
  "largura": 33,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "con_impleo",
  "rotulo": "Impressora Leopardo A7",
  "grupo": "Impressão",
  "bloco": "IMP3",
  "largura": 33,
  "controle": "booleano",
  "tipo": "texto"
 },
 {
  "campo": "cai_reimprime",
  "rotulo": "Reimprimir Cupom Térmica (central de notas)",
  "grupo": "Impressão",
  "bloco": "IMP4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_impcompvenda",
  "rotulo": "Imprimir Comprovante de Venda",
  "grupo": "Impressão",
  "bloco": "IMP4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_reimpcompvenda",
  "rotulo": "Reimpressão do Comprovante",
  "grupo": "Impressão",
  "bloco": "IMP4",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "con_compaprazo",
  "rotulo": "Comprovante a Prazo",
  "grupo": "Impressão",
  "bloco": "IMP5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_reimpressaonota",
  "rotulo": "Reimpressão nota (Frente de Caixa)",
  "grupo": "Impressão",
  "bloco": "IMP5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_imppedido",
  "rotulo": "Impressão de pedido",
  "grupo": "Impressão",
  "bloco": "IMP5",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_codigo",
  "rotulo": "Caixa",
  "grupo": "Caixa",
  "bloco": "CX1",
  "largura": 20,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_alertasan",
  "rotulo": "Alerta sangria",
  "grupo": "Caixa",
  "bloco": "CX1",
  "largura": 20,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_limitesan",
  "rotulo": "Limite sangria",
  "grupo": "Caixa",
  "bloco": "CX1",
  "largura": 20,
  "controle": "texto",
  "tipo": "decimal"
 },
 {
  "campo": "cai_gaveta",
  "rotulo": "Gaveta",
  "grupo": "Caixa",
  "bloco": "CX1",
  "largura": 20,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "cai_casasdecpeso",
  "rotulo": "Casas decimais peso",
  "grupo": "Caixa",
  "bloco": "CX1",
  "largura": 20,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "con_serie",
  "rotulo": "Série",
  "grupo": "Caixa",
  "subgrupo": "NF-e",
  "bloco": "CX2",
  "largura": 50,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_ultimanota",
  "rotulo": "N. Nota",
  "grupo": "Caixa",
  "subgrupo": "NF-e",
  "bloco": "CX2",
  "largura": 50,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "con_serienfc",
  "rotulo": "Série",
  "grupo": "Caixa",
  "subgrupo": "NFC-e",
  "bloco": "CX3",
  "largura": 50,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "con_ultimanfc",
  "rotulo": "N. Nota",
  "grupo": "Caixa",
  "subgrupo": "NFC-e",
  "bloco": "CX3",
  "largura": 50,
  "controle": "texto",
  "tipo": "inteiro"
 },
 {
  "campo": "cai_exclusivo",
  "rotulo": "Exclusivo em tela",
  "grupo": "Caixa",
  "bloco": "CX4",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_logs",
  "rotulo": "Habilita log",
  "grupo": "Caixa",
  "bloco": "CX4",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_novabuscaimp",
  "rotulo": "Busca imposto novo",
  "grupo": "Caixa",
  "bloco": "CX4",
  "largura": 25,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "cai_usapinpad",
  "rotulo": "Usa Pin pad",
  "grupo": "Pin pad / TEF",
  "subgrupo": "Pin pad",
  "bloco": "PINPAD01",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_modelopinpad",
  "rotulo": "Gerenciador TEF",
  "grupo": "Pin pad / TEF",
  "bloco": "PINPAD1",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "Nenhum",
   "Pay Go",
   "Sitef"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "cai_ttpendentende",
  "rotulo": "Transação pendente",
  "grupo": "Pin pad / TEF",
  "bloco": "PINPAD1",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "Confirmar",
   "Estornar",
   "Perguntar"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "cai_ttinicia",
  "rotulo": "Pendência na inicialização",
  "grupo": "Pin pad / TEF",
  "bloco": "PINPAD1",
  "largura": 33,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "Não fazer nada",
   "Processar pendentes",
   "Cancelar/Estornar"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "cai_exibeqrcode",
  "rotulo": "QRCode",
  "grupo": "Pin pad / TEF",
  "bloco": "PINPAD2",
  "largura": 50,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "Não suportado",
   "Automático",
   "Exibir no PinPad",
   "Exibir na Tela",
   "Imprimir"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "cai_viacliente",
  "rotulo": "Imprimir via cliente",
  "grupo": "Pin pad / TEF",
  "bloco": "PINPAD2",
  "largura": 50,
  "controle": "lista",
  "tipo": "inteiro",
  "opcoes": [
   "Imprimir",
   "Perguntar",
   "Não imprimir"
  ],
  "valorPorIndice": true
 },
 {
  "campo": "pdv_viareduzida",
  "rotulo": "Imprimir Via Reduzida",
  "grupo": "Pin pad / TEF",
  "subgrupo": "Pin pad",
  "bloco": "PINPAD01",
  "largura": 33,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_transautomatica",
  "rotulo": "Confirmar transações automaticamente",
  "grupo": "Pin pad / TEF",
  "subgrupo": "Pin pad",
  "bloco": "PINPAD3",
  "largura": 50,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_desabpinpad",
  "rotulo": "Permite desabilitar o pinpad na finalização",
  "grupo": "Pin pad / TEF",
  "subgrupo": "Pin pad",
  "bloco": "PINPAD3",
  "largura": 50,
  "controle": "booleano",
  "tipo": "booleano"
 },
 {
  "campo": "pdv_codemptef",
  "rotulo": "Cód. Empresa",
  "grupo": "Pin pad / TEF",
  "subgrupo": "TEF",
  "bloco": "TEF1",
  "largura": 25,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "pdv_codfiltef",
  "rotulo": "Cód. Filial",
  "grupo": "Pin pad / TEF",
  "subgrupo": "TEF",
  "bloco": "TEF1",
  "largura": 25,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "pdv_codtertef",
  "rotulo": "Cód. Terminal",
  "grupo": "Pin pad / TEF",
  "subgrupo": "TEF",
  "bloco": "TEF1",
  "largura": 25,
  "controle": "texto",
  "tipo": "texto"
 },
 {
  "campo": "pdv_servidortef",
  "rotulo": "Servidor",
  "grupo": "Pin pad / TEF",
  "subgrupo": "TEF",
  "bloco": "TEF1",
  "largura": 25,
  "controle": "texto",
  "tipo": "texto"
 }
];
