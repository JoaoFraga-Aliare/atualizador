// Contrato EXTERNO (o que o cliente ve e envia): nomes simples e tipos claros, independentes do
// Agrosys. Internamente o Hub guarda no formato do terminal (colunas legadas); este arquivo e o
// tradutor: `legado` liga cada campo externo a coluna interna, `conversao` ajusta o valor.
//
// Para mudar um nome ou acrescentar um campo, edite o contrato abaixo: a validacao, a traducao e a
// documentacao (pagina /docs) saem daqui. Campos com `confirmar: true` aparecem na documentacao com
// o aviso "nome/significado a confirmar".
import { z } from 'zod';
import { entidades, type NomeEntidade } from './entities.generated';

export type TipoCampo = 'texto' | 'inteiro' | 'decimal' | 'data';
// flag01: 0/1 no contrato <-> boolean no terminal. simnao: 0/1 no contrato <-> 'yes'/'no' no terminal.
export type Conversao = 'flag01' | 'simnao';

export type CampoContrato = {
  nome: string;              // nome externo (camelCase, simples)
  legado: string;            // coluna interna
  tipo: TipoCampo;           // tipo no contrato (flag01/simnao sao "inteiro" 0/1)
  descricao: string;
  valores?: string;          // valores esperados, em texto (ex.: "0 = inativo, 1 = ativo")
  conversao?: Conversao;
  obrigatorio?: boolean;     // chave do registro: precisa vir
  tamanho?: number;          // texto: maximo de caracteres
  confirmar?: boolean;       // nome/significado a confirmar com o negocio
};

export type Contrato = {
  entidade: NomeEntidade;
  caminho: string;           // ex.: "fiscal-operation" -> POST /v1/fiscal-operation
  titulo: string;
  descricao: string;
  campos: CampoContrato[];
  exemplo: Record<string, unknown>;
  observacao?: string;
};

const flag = (nome: string, legado: string, descricao: string, valores: string, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ nome, legado, tipo: 'inteiro', conversao: 'flag01', descricao, valores, ...extra });
const simnao = (nome: string, legado: string, descricao: string, valores: string, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ nome, legado, tipo: 'inteiro', conversao: 'simnao', descricao, valores, ...extra });
const txt = (nome: string, legado: string, tamanho: number, descricao: string, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ nome, legado, tipo: 'texto', tamanho, descricao, ...extra });
const int = (nome: string, legado: string, descricao: string, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ nome, legado, tipo: 'inteiro', descricao, ...extra });
const dec = (nome: string, legado: string, descricao: string, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ nome, legado, tipo: 'decimal', descricao, ...extra });
const data = (nome: string, legado: string, descricao: string, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ nome, legado, tipo: 'data', descricao, valores: 'AAAA-MM-DD', ...extra });

export const contratos: Contrato[] = [
  {
    entidade: 'fiscal-operations', caminho: 'fiscal-operation', titulo: 'Natureza de operação (CFOP)',
    descricao: 'Naturezas de operação fiscal usadas nas vendas e notas.',
    campos: [
      int('codigo', 'nat_codigo', 'Código da natureza de operação.', { obrigatorio: true }),
      txt('descricao', 'nat_descrnatope', 150, 'Descrição da natureza de operação.'),
      flag('ativo', 'nat_ativa', 'Indica se a natureza pode ser usada.', '0 = inativa, 1 = ativa'),
      int('codigoFiscal', 'nat_codoperfisc', 'Código fiscal da operação (CFOP).', { confirmar: true }),
      txt('descricaoFiscal', 'nat_descroperfisc', 200, 'Descrição da operação fiscal.'),
      txt('operacao', 'nat_operacao', 200, 'Descrição complementar da operação.', { confirmar: true }),
      flag('devolucaoCliente', 'nat_devcli', 'Indica devolução de cliente.', '0 = não, 1 = sim'),
      int('tipoDevolucao', 'nat_tpdev', 'Tipo de devolução.', { confirmar: true }),
      flag('entrada', 'nat_tipo', 'Indica natureza de ENTRADA (define a UF de origem/destino do imposto).', '0 = saída, 1 = entrada'),
    ],
    exemplo: { codigo: 5102, descricao: 'Venda de mercadoria', ativo: 1, codigoFiscal: 5102, descricaoFiscal: 'Venda de mercadoria adquirida de terceiros', devolucaoCliente: 0 },
  },
  {
    entidade: 'brands', caminho: 'brand', titulo: 'Marca',
    descricao: 'Marcas de produtos.',
    campos: [
      int('codigo', 'mar_codigo', 'Código da marca.', { obrigatorio: true }),
      txt('descricao', 'mar_descricao', 70, 'Nome da marca.'),
    ],
    exemplo: { codigo: 12, descricao: 'Sementes Boa Safra' },
  },
  {
    entidade: 'card-brands', caminho: 'card-brand', titulo: 'Bandeira de cartão',
    descricao: 'Bandeiras de cartão aceitas.',
    campos: [
      int('codigo', 'ban_codigo', 'Código da bandeira.', { obrigatorio: true }),
      txt('descricao', 'ban_descricao', 50, 'Nome da bandeira.'),
      int('ordem', 'ban_sequencia', 'Ordem de exibição.'),
    ],
    exemplo: { codigo: 1, descricao: 'Visa', ordem: 1 },
  },
  {
    entidade: 'bank-branches', caminho: 'bank-branch', titulo: 'Agência bancária',
    descricao: 'Contas e agências bancárias da empresa.',
    campos: [
      int('empresa', 'emp_empresa', 'Código da empresa.', { obrigatorio: true }),
      int('contaReduzida', 'agp_ctared', 'Conta reduzida (contábil).', { obrigatorio: true }),
      int('banco', 'ban_banco', 'Código do banco.', { obrigatorio: true }),
      txt('nomeBanco', 'ban_nome', 50, 'Nome do banco.'),
      int('agencia', 'ban_agencia', 'Número da agência.'),
      txt('nomeAgencia', 'age_nome', 50, 'Nome da agência.'),
      txt('contaCorrente', 'ban_ccorrente', 15, 'Número da conta corrente.'),
      txt('cnpj', 'ban_cnpj', 14, 'CNPJ do titular, só dígitos.'),
    ],
    exemplo: { empresa: 1, contaReduzida: 1102, banco: 1, nomeBanco: 'Banco do Brasil', agencia: 1234, nomeAgencia: 'Centro', contaCorrente: '56789-0', cnpj: '12345678000190' },
  },
  {
    entidade: 'accreditations', caminho: 'accreditation', titulo: 'Credenciadora de cartão',
    descricao: 'Credenciadoras (adquirentes) de cartão.',
    campos: [
      int('codigo', 'cre_codigo', 'Código da credenciadora.', { obrigatorio: true }),
      int('ordem', 'cre_seq', 'Ordem de exibição.'),
      txt('descricao', 'cre_descricao', 70, 'Nome da credenciadora.'),
      flag('ativo', 'cre_ativo', 'Indica se está ativa.', '0 = inativa, 1 = ativa'),
      txt('contaReduzida', 'pag_ctared', 10, 'Conta reduzida do recebimento.'),
      int('codigoBandeira', 'cre_bandeira', 'Código da bandeira de cartão.'),
      txt('cnpj', 'cre_cnpj', 15, 'CNPJ da credenciadora, só dígitos.'),
    ],
    exemplo: { codigo: 3, descricao: 'Cielo', ativo: 1, contaReduzida: '1105', cnpj: '01027058000191' },
  },
  {
    entidade: 'agronomists', caminho: 'agronomist', titulo: 'Técnico agrônomo',
    descricao: 'Responsáveis técnicos (receituário agronômico).',
    campos: [
      int('empresa', 'emp_empresa', 'Código da empresa.', { obrigatorio: true }),
      int('codigo', 'tcf_codigo', 'Código do técnico.', { obrigatorio: true }),
      txt('nome', 'tcf_nome', 50, 'Nome do técnico.'),
      txt('cpf', 'tcf_cpf', 11, 'CPF, só dígitos.'),
      txt('crmv', 'tcf_crmv', 20, 'Registro no CRMV.'),
      txt('registro', 'tcf_registro', 50, 'Número do registro profissional.'),
      txt('descricaoRegistro', 'tcf_descreg', 50, 'Descrição do conselho/registro.'),
    ],
    exemplo: { empresa: 1, codigo: 7, nome: 'Ana Souza', cpf: '12345678901', registro: 'CREA-MT 123456' },
  },
  {
    entidade: 'creditors', caminho: 'creditor', titulo: 'Credor',
    descricao: 'Credores usados em sangria/suprimento e pagamentos de caixa.',
    campos: [
      int('codigo', 'cre_codigo', 'Código do credor.', { obrigatorio: true }),
      txt('tipo', 'cre_tipo', 10, 'Tipo do credor.', { confirmar: true }),
      txt('nome', 'cre_nome', 200, 'Nome do credor.'),
      txt('documento', 'cre_doc', 30, 'CPF ou CNPJ, só dígitos.'),
    ],
    exemplo: { codigo: 450, tipo: 'FORN', nome: 'Distribuidora Central Ltda', documento: '12345678000190' },
  },
  {
    entidade: 'operations', caminho: 'operation', titulo: 'Operação',
    descricao: 'Operações comerciais.',
    campos: [
      int('codigo', 'ope_codigo', 'Código da operação.', { obrigatorio: true }),
      txt('descricao', 'ope_descricao', 200, 'Descrição da operação.'),
      int('empresa', 'emp_empresa', 'Código da empresa.'),
      int('filial', 'fil_filial', 'Código da filial.'),
    ],
    exemplo: { codigo: 1, descricao: 'Venda balcão', empresa: 1, filial: 1 },
  },
  {
    entidade: 'sales-reps', caminho: 'sales-rep', titulo: 'Vendedor / representante',
    descricao: 'Vendedores e representantes comerciais.',
    campos: [
      int('codigo', 'rvd_codigo', 'Código do vendedor.', { obrigatorio: true }),
      int('empresa', 'emp_empresa', 'Código da empresa.'),
      txt('nome', 'rvd_nome', 70, 'Nome do vendedor.'),
      txt('email', 'rvd_email', 70, 'E-mail.'),
      txt('telefone', 'rvd_fone1', 70, 'Telefone principal.'),
      txt('telefone2', 'rvd_fone2', 70, 'Telefone secundário.'),
      int('situacao', 'rvd_situac', 'Situação do vendedor.', { confirmar: true, valores: 'a confirmar (ex.: 0 = inativo, 1 = ativo)' }),
      txt('tipo', 'rvd_tipo', 3, 'Tipo do vendedor.', { confirmar: true }),
      txt('usuario', 'usu_usulogin', 70, 'Usuário (login) do vendedor.'),
      int('codigoSupervisor', 'rvd_supervisor', 'Código do vendedor supervisor.'),
      dec('comissaoPadrao', 'rvd_compad', 'Comissão padrão, em %.'),
      dec('comissaoAVista', 'rvd_comavista', 'Comissão à vista, em %.'),
      dec('comissaoAPrazo', 'rvd_comprz', 'Comissão a prazo, em %.'),
      dec('comissaoAdicional', 'rvd_comadic', 'Comissão adicional, em %.'),
      dec('descontoMaximoVenda', 'rvd_desctovda', 'Desconto máximo permitido na venda, em %.'),
    ],
    exemplo: { codigo: 16, empresa: 1, nome: 'Carlos Lima', email: 'carlos@empresa.com', telefone: '(65) 99999-0000', situacao: 1, comissaoPadrao: 2.5 },
  },
  {
    entidade: 'payment-terms', caminho: 'payment-term', titulo: 'Condição de pagamento',
    descricao: 'Condições de pagamento disponíveis para venda.',
    campos: [
      txt('codigo', 'cpg_condpag', 70, 'Código da condição (texto).', { obrigatorio: true }),
      txt('descricao', 'cpg_descricao', 70, 'Descrição.'),
      int('empresa', 'emp_empresa', 'Código da empresa.'),
      simnao('ativo', 'cpg_situac', 'Indica se a condição está ativa.', '0 = inativa, 1 = ativa'),
      simnao('disponivelPdv', 'cpg_pdv', 'Indica se aparece no PDV.', '0 = não, 1 = sim'),
      flag('aVista', 'cpg_avista', 'Indica pagamento à vista.', '0 = não, 1 = sim'),
      flag('antecipado', 'cpg_antecipado', 'Indica pagamento antecipado.', '0 = não, 1 = sim'),
      int('prazoDias', 'cpg_nrdias', 'Prazo total, em dias.'),
      int('parcelas', 'cpg_nrparcelas', 'Número de parcelas.'),
      dec('percentual', 'cpg_percentual', 'Percentual da condição.', { confirmar: true }),
      dec('percentualDesconto', 'cpg_pcdescon', 'Percentual de desconto, em %.'),
      int('tipoCondicao', 'cpg_tpcond', 'Tipo da condição de pagamento.', { confirmar: true }),
    ],
    exemplo: { codigo: '30', descricao: '30 dias', empresa: 1, ativo: 1, disponivelPdv: 1, aVista: 0, prazoDias: 30, parcelas: 1 },
  },
  {
    entidade: 'carriers', caminho: 'carrier', titulo: 'Transportador',
    descricao: 'Transportadoras e motoristas autônomos.',
    campos: [
      int('codigo', 'tra_codigo', 'Código do transportador.', { obrigatorio: true }),
      txt('nome', 'tra_nome', 70, 'Nome ou razão social.'),
      txt('cnpj', 'tra_cgc', 70, 'CNPJ, só dígitos.'),
      txt('cpf', 'tra_cpf', 70, 'CPF (autônomo), só dígitos.'),
      txt('inscricaoEstadual', 'tra_inscest', 70, 'Inscrição estadual.'),
      txt('endereco', 'tra_ender', 70, 'Endereço.'),
      txt('cep', 'tra_cep', 70, 'CEP, só dígitos.'),
      int('codigoCidade', 'cid_cidade', 'Código da cidade.'),
      txt('telefone', 'tra_fone', 70, 'Telefone.'),
      txt('email', 'tra_email_tic', 70, 'E-mail.'),
      txt('responsavel', 'tra_responsavel', 70, 'Pessoa responsável.'),
      txt('antt', 'tra_antt', 70, 'Registro ANTT.'),
      simnao('autonomo', 'tra_autonomo', 'Indica transportador autônomo.', '0 = não, 1 = sim'),
      txt('placaVeiculo', 'nfs_placam', 70, 'Placa do veículo.'),
      txt('placaReboque', 'nfs_placar', 70, 'Placa do reboque.'),
    ],
    exemplo: { codigo: 5, nome: 'Transportes Rápido Ltda', cnpj: '12345678000190', telefone: '(65) 3333-0000', autonomo: 0, placaVeiculo: 'ABC1D23' },
  },
  {
    entidade: 'stock-balance', caminho: 'stock-balance', titulo: 'Saldo de estoque',
    descricao: 'Saldo disponível por produto. Em tempo real o saldo é consultado no ERP; esta carga serve de base local.',
    campos: [
      int('produto', 'pro_codigo', 'Código do produto.', { obrigatorio: true }),
      dec('quantidade', 'sal_item', 'Quantidade disponível.'),
      flag('vendavel', 'pro_vendavel', 'Indica se o produto pode ser vendido.', '0 = não, 1 = sim'),
    ],
    exemplo: { produto: 1001, quantidade: 250.5, vendavel: 1 },
  },
  {
    entidade: 'prices', caminho: 'price', titulo: 'Preço de produto',
    descricao: 'Preço de cada produto em cada tabela de preço.',
    observacao: 'A tabela de preço por ocorrência (pro_preconew) e as faixas por ocorrência ainda não têm campo no contrato.',
    campos: [
      int('tabelaPreco', 'pre_tiporeg', 'Código da tabela de preço.', { obrigatorio: true }),
      int('produto', 'ite_codigo', 'Código do produto.', { obrigatorio: true }),
      dec('valor', 'pre_valor', 'Preço de venda.'),
      dec('valorMinimo', 'pre_vlmin', 'Preço mínimo de venda.'),
      dec('valorCusto', 'pre_vlcusto', 'Custo do produto.'),
      dec('valorFretePorKg', 'pre_vlfrekg', 'Valor de frete por kg.'),
      data('validade', 'pre_dtvalid', 'Fim da validade do preço.'),
      data('emissao', 'pre_emissao', 'Data de emissão do preço.'),
      int('empresa', 'emp_empresa', 'Código da empresa.'),
      int('unidade', 'uni_unidade', 'Código da unidade.'),
      txt('condicaoPagamento', 'cpg_condpag', 20, 'Condição de pagamento a que o preço se aplica.'),
      int('cliente', 'cli_codigo', 'Cliente (preço específico).'),
      int('dias', 'pre_dias', 'Prazo em dias.'),
      txt('observacao', 'pre_obs', 70, 'Observação.'),
    ],
    exemplo: { tabelaPreco: 1, produto: 1001, valor: 89.9, valorMinimo: 80, valorCusto: 62.35, validade: '2026-12-31', empresa: 1, unidade: 1 },
  },
  {
    entidade: 'products', caminho: 'product', titulo: 'Produto',
    descricao: 'Cadastro de produtos. Preço, saldo, lote e promoção têm recursos próprios.',
    observacao: 'Contrato com as colunas que o PDV lê (os demais campos do cadastro do ERP não são usados na venda).',
    campos: [
      int('codigo', 'pro_codigo', 'Código do produto.', { obrigatorio: true }),
      txt('descricao', 'pro_descricao', 150, 'Descrição do produto.'),
      txt('descricaoFaturamento', 'pro_descrifat', 150, 'Descrição usada na nota fiscal.'),
      txt('nomeUsual', 'pro_nomeusual1', 150, 'Nome usual (como o balconista chama o produto).'),
      simnao('ativo', 'pro_ativo', 'Indica se o produto está ativo.', '0 = inativo, 1 = ativo'),
      txt('unidade', 'pro_unifat', 70, 'Unidade de venda/faturamento.', { valores: 'ex.: UN, KG, SC, L' }),
      txt('codigoBarras', 'pro_ean', 50, 'Código de barras (EAN/GTIN).'),
      txt('ncm', 'pro_clasfis', 70, 'Classificação fiscal (NCM), só dígitos.'),
      txt('cest', 'pro_cest', 15, 'Código CEST.'),
      int('marca', 'mar_codigo', 'Código da marca (veja o recurso brand).'),
      int('grupo', 'gru_codigo', 'Código do grupo do produto.'),
      int('origem', 'ori_codigo', 'Código de origem da mercadoria.', { confirmar: true }),
      int('procedencia', 'ite_procedencia', 'Procedência da mercadoria.', { confirmar: true }),
      int('tributacao', 'pro_tributa', 'Código de tributação.', { confirmar: true }),
      int('naturezaOperacao', 'nat_codigo', 'Natureza de operação padrão (veja fiscal-operation).'),
      dec('pesoUnitario', 'pro_psunitario', 'Peso unitário.'),
      dec('valorUnitario', 'pro_vlunitario', 'Valor unitário de referência.'),
      dec('percentualImpostoAproximado', 'pro_ibpt', 'Percentual aproximado de tributos (IBPT), em %.'),
      int('tipoValor', 'pro_tipoval', 'Como o produto é vendido/pesado.', { valores: '0 ou 1 (a confirmar: 0 = unidade, 1 = peso)', confirmar: true }),
      flag('pesoPadrao', 'pro_pspadrao', 'Indica produto de peso padrão.', '0 = não, 1 = sim', { confirmar: true }),
      int('validadeDias', 'pro_validade', 'Validade, em dias (etiqueta de balança).'),
      dec('pesoEmbalagem', 'pro_pempeso', 'Peso da embalagem (tara).'),
      txt('teclaBalanca', 'ite_display', 15, 'Tecla/atalho do produto na balança.'),
      txt('cultura', 'ite_cultura', 5, 'Cultura (agro) a que o produto se aplica.'),
      flag('controlaLote', 'sit_controlote', 'Indica produto controlado por lote.', '0 = não, 1 = sim'),
      int('codigoAnp', 'ite_prodanp', 'Código do produto na ANP (combustíveis).'),
      int('tipoProduto', 'tip_codigo', 'Código do tipo do produto (entra na busca de imposto, veja tax-rule).'),
      txt('agrotoxico', 'pro_margem', 3, 'Indica produto agrotóxico: SIM exige receituário e inscrição estadual do cliente.', { valores: 'SIM ou NAO' }),
    ],
    exemplo: { codigo: 1001, descricao: 'Semente de Soja 40kg', ativo: 1, unidade: 'SC', codigoBarras: '7891234567890', ncm: '12019000', marca: 12, grupo: 3, pesoUnitario: 40, valorUnitario: 89.9, controlaLote: 1 },
  },
  {
    entidade: 'customers', caminho: 'customer', titulo: 'Cliente',
    descricao: 'Cadastro de clientes. Condições comerciais por empresa/unidade/filial ficam em customer-unit.',
    observacao: 'Contrato com os dados que o PDV usa na venda e na nota; campos de controle interno do ERP não aparecem.',
    campos: [
      int('codigo', 'cli_codigo', 'Código do cliente.', { obrigatorio: true }),
      txt('razaoSocial', 'cli_razsoc', 150, 'Razão social ou nome completo.'),
      txt('nomeFantasia', 'cli_fantasi', 150, 'Nome fantasia.'),
      simnao('ativo', 'cli_sitcli', 'Indica se o cliente está ativo (inativo bloqueia a venda).', '0 = inativo, 1 = ativo'),
      txt('motivoInativacao', 'cli_motinativ', 70, 'Motivo da inativação ou restrição.'),
      simnao('pessoaFisica', 'cli_fisjur', 'Tipo de pessoa.', '0 = jurídica, 1 = física', { confirmar: true }),
      txt('cpf', 'cli_cpf', 70, 'CPF, só dígitos.'),
      txt('cnpj', 'cli_cgc', 70, 'CNPJ, só dígitos.'),
      txt('inscricaoEstadual', 'cli_inscest', 70, 'Inscrição estadual.'),
      txt('inscricaoMunicipal', 'cli_inscmuni', 70, 'Inscrição municipal.'),
      txt('suframa', 'cli_suframa', 30, 'Inscrição na Suframa.'),
      flag('consumidorFinal', 'cli_consfinal', 'Indica consumidor final.', '0 = não, 1 = sim'),
      flag('aplicaSubstituicaoTributaria', 'cli_aplicast', 'Indica aplicação de substituição tributária.', '0 = não, 1 = sim'),
      int('regimeTributario', 'cli_crt', 'Código de regime tributário (CRT).', { confirmar: true }),
      txt('email', 'cli_email', 300, 'E-mail.'),
      txt('emailNota', 'cli_mailnf', 70, 'E-mail para envio de nota fiscal.'),
      txt('telefone', 'cli_fone1', 70, 'Telefone principal.'),
      txt('telefone2', 'cli_fone2', 70, 'Telefone secundário.'),
      txt('endereco', 'cli_endere', 500, 'Logradouro.'),
      txt('numero', 'cli_numero', 70, 'Número.'),
      txt('bairro', 'cli_bairro', 70, 'Bairro.'),
      txt('cep', 'cli_cep', 70, 'CEP, só dígitos.'),
      int('codigoCidade', 'cid_cidade', 'Código da cidade (veja Hub > Cidades; é a numeração do PDV/Agrosys, não o código IBGE).'),
      txt('uf', 'est_estado', 70, 'Sigla do estado.', { valores: 'ex.: SP, MT, GO' }),
      txt('pontoReferencia', 'cli_ptref', 70, 'Ponto de referência.'),
      int('vendedor', 'rvd_codigo', 'Código do vendedor do cliente (veja sales-rep).'),
      dec('limiteCredito', 'val_limcred', 'Limite de crédito.'),
      dec('creditoLiberado', 'val_liberado', 'Crédito liberado (disponível).'),
      dec('titulosEmAberto', 'val_titaberto', 'Total de títulos em aberto.'),
      dec('pedidosEmAberto', 'val_pedaberto', 'Total de pedidos em aberto.'),
      int('prazoMaximoDias', 'cli_nrmaxdias', 'Prazo máximo de venda a prazo, em dias.'),
      txt('restricao', 'cli_restricao', 150, 'Texto de restrição exibido na venda.'),
      dec('descontoFinanceiro', 'cli_descfin', 'Desconto financeiro, em %.'),
      int('contribuinteIcms', 'cli_crticm', 'Contribuinte de ICMS (usado na busca de imposto, veja tax-rule).', { confirmar: true }),
      int('enquadramentoFiscal', 'cli_enqfisc', 'Enquadramento fiscal do cliente (3 = consumidor final nas regras de CFOP).', { confirmar: true }),
      txt('tipoCadastro', 'for_tipo', 3, 'Tipo do cadastro para a busca de imposto (ex.: F).', { confirmar: true }),
      flag('simplesNacional', 'for_simples', 'Indica optante pelo Simples Nacional.', '0 = não, 1 = sim'),
      int('grupoFluxo', 'for_grupflcx', 'Grupo de fluxo de caixa (usado no cálculo do contribuinte de ICMS).', { confirmar: true }),
      int('subgrupoFluxo', 'for_subgrcxa', 'Subgrupo de fluxo de caixa (usado no cálculo do contribuinte de ICMS).', { confirmar: true }),
      int('tipoEnteGovernamental', 'cli_tpentegov', 'Tipo de ente governamental (0 = não é; Reforma Tributária).', { confirmar: true }),
    ],
    exemplo: { codigo: 8890, razaoSocial: 'Fazenda Boa Esperança Ltda', ativo: 1, pessoaFisica: 0, cnpj: '12345678000190', inscricaoEstadual: '131234567', consumidorFinal: 0, email: 'compras@boaesperanca.com.br', telefone: '(65) 3333-0000', endereco: 'Rodovia MT-130', bairro: 'Zona Rural', cep: '78700000', codigoCidade: 5107602, uf: 'MT', vendedor: 16, limiteCredito: 50000, prazoMaximoDias: 60 },
  },
  {
    entidade: 'customer-units', caminho: 'customer-unit', titulo: 'Cliente por unidade',
    descricao: 'Condições comerciais do cliente em cada empresa/unidade/filial: pagamento, tabela de preço, limites e situação financeira.',
    observacao: 'A chave é o código do cliente (customer); um registro por cliente.',
    campos: [
      int('cliente', 'cli_codigo', 'Código do cliente (veja customer).', { obrigatorio: true }),
      int('empresa', 'emp_empresa', 'Código da empresa.'),
      int('unidade', 'uni_unidade', 'Código da unidade.'),
      int('filial', 'fil_filial', 'Código da filial.'),
      txt('condicaoPagamento', 'cpg_condpag', 70, 'Condição de pagamento padrão (veja payment-term).'),
      int('tabelaPreco', 'cli_tabpre', 'Tabela de preço do cliente (veja price).'),
      int('tipoPreco', 'pre_tiporeg', 'Tipo de preço aplicado.', { confirmar: true }),
      int('naturezaOperacao', 'nat_codigo', 'Natureza de operação padrão (veja fiscal-operation).'),
      int('tipoNota', 'tip_nota', 'Tipo de nota padrão.', { confirmar: true }),
      txt('tipoDocumento', 'tpd_tpdocmto', 70, 'Tipo de documento de cobrança.'),
      dec('limiteCredito', 'cli_limcred', 'Limite de crédito da unidade.'),
      int('prazoMaximoDias', 'cli_nrmaxdias', 'Prazo máximo, em dias.'),
      dec('descontoFinanceiro', 'cli_descfin', 'Desconto financeiro, em %.'),
      dec('descontoPedido', 'ped_descon', 'Desconto padrão do pedido, em %.'),
      dec('saldoDevedor', 'tit_vlsaldodev', 'Saldo devedor.'),
      flag('emAtraso', 'tit_atraso', 'Indica títulos em atraso.', '0 = não, 1 = sim'),
      dec('saldoEmAtraso', 'tit_vlsalatraso', 'Valor em atraso.'),
      txt('rota', 'rot_codigo', 70, 'Código da rota de entrega.'),
      int('area', 'are_codigo', 'Código da área do cliente.', { confirmar: true }),
      int('complementoNatureza', 'nae_codcompl', 'Complemento da natureza de operação padrão.'),
    ],
    exemplo: { cliente: 8890, empresa: 1, unidade: 1, filial: 1, condicaoPagamento: '30', tabelaPreco: 1, limiteCredito: 50000, emAtraso: 0, saldoDevedor: 1200.5 },
  },
  {
    entidade: 'stock-lots', caminho: 'stock-lot', titulo: 'Lote de estoque',
    descricao: 'Lotes de produtos controlados por lote, com saldo, validade e características.',
    campos: [
      txt('lote', 'mov_lote', 70, 'Identificação do lote.', { obrigatorio: true }),
      int('produto', 'ite_codigo', 'Código do produto.', { obrigatorio: true }),
      int('empresa', 'emp_empresa', 'Código da empresa.'),
      int('unidade', 'uni_unidade', 'Código da unidade.'),
      dec('quantidade', 'mov_qtsaldo', 'Saldo do lote.'),
      data('vencimento', 'mov_dtvencto', 'Data de vencimento do lote.'),
      data('fabricacao', 'mov_dtfabricacao', 'Data de fabricação do lote.'),
      data('dataMovimento', 'mov_data', 'Data do movimento de entrada do lote.'),
      txt('fabricante', 'mov_fabric', 70, 'Fabricante.'),
      dec('germinacao', 'mov_pcgerm', 'Percentual de germinação, em %.'),
      dec('pureza', 'mov_pcpuro', 'Percentual de pureza, em %.'),
      txt('transportador', 'tra_codigo', 70, 'Código do transportador da entrada.'),
      txt('usuario', 'usu_usuario', 70, 'Usuário que registrou o lote.'),
      int('situacao', 'mov_status', 'Situação do lote.', { confirmar: true }),
    ],
    exemplo: { lote: 'L2026-0412', produto: 1001, empresa: 1, unidade: 1, quantidade: 120, vencimento: '2027-06-30', fabricacao: '2026-04-12', germinacao: 92.5, pureza: 99 },
  },
  {
    entidade: 'promotional-prices', caminho: 'promotional-price', titulo: 'Preço promocional',
    descricao: 'Promoções por produto, com faixa de quantidade/peso e período.',
    observacao: 'A chave tem sete campos; mande-os sempre juntos para atualizar a mesma promoção.',
    campos: [
      int('empresa', 'emp_empresa', 'Código da empresa.', { obrigatorio: true }),
      int('unidade', 'uni_unidade', 'Código da unidade.', { obrigatorio: true }),
      txt('tipoCodigo', 'prm_tpcod', 18, 'Tipo do código da promoção.', { obrigatorio: true, confirmar: true }),
      int('codigoReducaoCliente', 'prm_codredcli', 'Código da redução por cliente.', { obrigatorio: true, confirmar: true }),
      flag('indicadorReducao', 'prm_indred', 'Indicador de redução.', '0 = não, 1 = sim', { obrigatorio: true, confirmar: true }),
      int('produto', 'ite_codigo', 'Código do produto.', { obrigatorio: true }),
      int('numeroPromocao', 'prm_nrpromo', 'Número da promoção.', { obrigatorio: true }),
      dec('preco', 'prm_preco', 'Preço promocional.'),
      dec('quantidadeMinima', 'prm_qtmin', 'Quantidade mínima.'),
      dec('quantidadeMaxima', 'prm_qtmax', 'Quantidade máxima.'),
      dec('pesoMinimo', 'prm_psmin', 'Peso mínimo.'),
      dec('pesoMaximo', 'prm_psmax', 'Peso máximo.'),
      data('inicio', 'prm_dtini', 'Início da promoção.'),
      data('fim', 'prm_dtfim', 'Fim da promoção.'),
      int('tabelaPreco', 'pre_tiporeg', 'Tabela de preço a que se aplica.'),
      int('tabelaPrecoCliente', 'cli_tabpre', 'Tabela de preço do cliente a que se aplica.'),
    ],
    exemplo: { empresa: 1, unidade: 1, tipoCodigo: 'PRODUTO', codigoReducaoCliente: 0, indicadorReducao: 0, produto: 1001, numeroPromocao: 1, preco: 79.9, quantidadeMinima: 10, inicio: '2026-11-01', fim: '2026-11-30', tabelaPreco: 1 },
  },
  {
    entidade: 'volume-prices', caminho: 'volume-price', titulo: 'Preço por volume',
    descricao: 'Preço mínimo por faixa de quantidade, por produto e tabela de preço.',
    observacao: 'A combinação de campos que identifica o registro (chave) é uma suposição: confirmar antes de usar em produção.',
    campos: [
      int('empresa', 'emp_empresa', 'Código da empresa.', { obrigatorio: true }),
      int('unidade', 'uni_unidade', 'Código da unidade.', { obrigatorio: true }),
      int('produto', 'ite_codigo', 'Código do produto.', { obrigatorio: true }),
      data('inicioVigencia', 'dtvig', 'Início da vigência.', { obrigatorio: true }),
      int('tabelaPreco', 'pre_tiporeg', 'Tabela de preço.', { obrigatorio: true }),
      int('quantidadeInicial', 'qtini', 'Quantidade inicial da faixa.', { obrigatorio: true }),
      data('fimVigencia', 'dtfvig', 'Fim da vigência.'),
      int('quantidadeFinal', 'qtfim', 'Quantidade final da faixa.'),
      dec('precoMinimo', 'prminimo', 'Preço mínimo na faixa.'),
    ],
    exemplo: { empresa: 1, unidade: 1, produto: 1001, inicioVigencia: '2026-11-01', tabelaPreco: 1, quantidadeInicial: 50, fimVigencia: '2026-12-31', quantidadeFinal: 99, precoMinimo: 82.5 },
  },
  {
    entidade: 'operation-fiscal-links', caminho: 'operation-fiscal-link', titulo: 'Vínculo operação × natureza',
    descricao: 'Liga cada natureza de operação (CFOP) às operações do terminal. O PDV usa o vínculo para escolher as regras de imposto de cada venda.',
    observacao: 'Cada linha precisa de um "sequencial" próprio (inteiro único, definido por você): é ele que identifica a linha para reenviar, alterar ou remover.',
    campos: [
      int('sequencial', 'seq', 'Identificador único da linha, definido por você (inteiro).', { obrigatorio: true }),
      int('natureza', 'nat_codigo', 'Código da natureza de operação (veja fiscal-operation).'),
      int('complemento', 'nae_codcompl', 'Complemento da natureza (use junto com todosComplementos = 0).'),
      flag('todosComplementos', 'opn_allcompl', 'Vale para todos os complementos da natureza.', '0 = só o complemento informado, 1 = todos'),
      txt('operacao', 'opn_operacao', 20, 'Código da operação (veja operation).'),
      flag('exceto', 'opn_exceto', 'Inverte o vínculo: vale para todas as operações, exceto a informada.', '0 = não, 1 = sim', { confirmar: true }),
      flag('altera', 'opn_altera', 'Permite alterar a operação na venda.', '0 = não, 1 = sim', { confirmar: true }),
      flag('sinal', 'opn_sinal', 'Sinal da operação.', '0 = negativo, 1 = positivo', { confirmar: true }),
    ],
    exemplo: { sequencial: 1, natureza: 5102, complemento: 0, todosComplementos: 1, operacao: 'VENDA' },
  },
  {
    entidade: 'cfop-table', caminho: 'cfop-rule', titulo: 'Regra de CFOP',
    descricao: 'Define o CFOP (e o complemento) de cada venda, por UF de destino, tipo de operação e a seleção (todos, NCM, item, origem ou grupo). Sem uma regra que case com o produto o PDV trava a venda ("CFOP não cadastrada").',
    observacao: 'O PDV aplica as regras em cascata e a última que casar vence: 0 (todos) → 3 (origem) → 4 (grupo) → 1 (NCM) → 2 (item). Cada linha precisa de um "sequencial" próprio (inteiro único, definido por você).',
    campos: [
      int('sequencial', 'seq', 'Identificador único da linha, definido por você (inteiro).', { obrigatorio: true }),
      int('empresa', 'emp_empresa', 'Código da empresa (o mesmo configurado no terminal).'),
      int('filial', 'fil_filial', 'Código da filial (o mesmo configurado no terminal).'),
      int('unidade', 'uni_unidade', 'Código da unidade; 0 = todas.'),
      txt('ufDestino', 'tcf_ufdest', 2, 'UF de destino da venda (a UF do emitente nas vendas do PDV).', { valores: 'ex.: MT' }),
      int('tipoOperacao', 'tcf_tpoper', 'Tipo de operação do terminal (o mesmo configurado no terminal, parâmetro de operação).'),
      int('tipoSelecao', 'tcf_tpsel', 'Como a regra seleciona o produto.', { valores: '0 = todos, 1 = NCM, 2 = item, 3 = origem, 4 = grupo' }),
      dec('referencia', 'tcf_ncmpro', 'Valor da seleção: NCM (só dígitos), código do item, origem ou grupo, conforme o tipoSelecao; 0 quando for "todos".'),
      int('cfop', 'tcf_cfop', 'CFOP da venda.'),
      int('complemento', 'tcf_cpl', 'Complemento da natureza do CFOP.'),
      int('cfopSuframa', 'tcf_alcfo', 'CFOP quando o cliente é Suframa.'),
      int('complementoSuframa', 'tcf_alcpl', 'Complemento quando o cliente é Suframa.'),
      int('cfopSubstituicaoTributaria', 'tcf_stcfop', 'CFOP quando o cliente aplica substituição tributária.'),
      int('complementoSubstituicaoTributaria', 'tcf_stcpl', 'Complemento quando o cliente aplica substituição tributária.'),
      int('cfopConsumidorFinal', 'tcf_cfcfop', 'CFOP para consumidor final (enquadramento 3 ou cliente consumidor final).'),
      int('complementoConsumidorFinal', 'tcf_cfcpl', 'Complemento para consumidor final.'),
    ],
    exemplo: { sequencial: 1, empresa: 1, filial: 1, unidade: 0, ufDestino: 'MT', tipoOperacao: 1, tipoSelecao: 0, referencia: 0, cfop: 5102, complemento: 1, cfopConsumidorFinal: 5102, complementoConsumidorFinal: 1 },
  },
  {
    entidade: 'taxes', caminho: 'tax-rule', titulo: 'Regra de imposto',
    descricao: 'Regras de ICMS, IPI, PIS, COFINS, ICMS-ST e (Reforma Tributária) CBS/IBS usadas no cálculo de cada item da nota: CST, alíquota, redução de base, benefício fiscal e demais campos fiscais.',
    observacao: 'A chave é codigo + tipoImposto + natureza, e o "codigo" deve ser único por regra. Para cada item o PDV escolhe a regra mais específica que casa com o item: campos em 0 (ou em branco) valem para qualquer valor. A vigência (vigenciaInicio/vigenciaFim) é obrigatória na prática: sem ela a regra não é aplicada.',
    campos: [
      int('codigo', 'imp_codigo', 'Código da regra (único).', { obrigatorio: true }),
      int('tipoImposto', 'tbi_codigo', 'Tipo de imposto.', { obrigatorio: true, valores: '1 = ICMS, 3 = IPI, 4 = PIS, 5 = COFINS, 6 = ICMS-ST, 33/34/35/36 = CBS/IBS' }),
      int('natureza', 'nat_codigo', 'Natureza de operação a que a regra se aplica (0 = qualquer; veja fiscal-operation).', { obrigatorio: true }),
      int('empresa', 'emp_empresa', 'Código da empresa (o mesmo configurado no terminal).'),
      int('filial', 'fil_filial', 'Código da filial (o mesmo configurado no terminal).'),
      txt('ufOrigem', 'est_origem', 2, 'UF de origem (em branco = qualquer).'),
      txt('ufDestino', 'est_destino', 2, 'UF de destino (em branco = qualquer).'),
      int('complementoNatureza', 'nae_codcompl', 'Complemento da natureza (0 = qualquer).'),
      txt('operacao', 'opn_operacao', 20, 'Operação (em branco = qualquer; veja operation).'),
      int('cliente', 'cli_codigo', 'Cliente específico (0 = qualquer; veja customer).'),
      int('contribuinteIcms', 'imp_ctricm', 'Contribuinte de ICMS do cliente (0 = qualquer).', { confirmar: true }),
      txt('tipoCadastro', 'for_tipo', 3, 'Tipo do cadastro do cliente (em branco = qualquer).', { confirmar: true }),
      int('enquadramentoCliente', 'int_reserva5', 'Enquadramento fiscal do cliente (0 = qualquer).', { confirmar: true }),
      int('produto', 'ite_codigo', 'Produto específico (0 = qualquer; veja product).'),
      int('ncm', 'imp_ncm', 'NCM (só dígitos; 0 = qualquer).'),
      int('tipoProduto', 'tip_codigo', 'Tipo do produto (0 = qualquer).'),
      int('grupo', 'gru_codigo', 'Grupo do produto (0 = qualquer).'),
      int('procedencia', 'imp_tributa', 'Procedência da mercadoria (99 = qualquer).', { confirmar: true }),
      int('cest', 'ite_cest', 'CEST (0 = qualquer).'),
      int('centroCusto', 'ccu_custo', 'Centro de custo (0 = qualquer).', { confirmar: true }),
      data('vigenciaInicio', 'imp_dtivig', 'Início da vigência da regra.'),
      data('vigenciaFim', 'imp_dtfvig', 'Fim da vigência (em branco = sem fim).'),
      int('cst', 'imp_triicm', 'CST (ou CSOSN) do imposto.'),
      dec('aliquota', 'imp_pcaliq', 'Alíquota, em %.'),
      dec('reducaoBase', 'imp_reducao', 'Redução da base de cálculo, em % (no ICMS-ST, percentual de redução da base ST).'),
      dec('margemValorAgregado', 'imp_acresc', 'Margem de valor agregado (MVA) do ICMS-ST, em %.'),
      dec('valorDeducao', 'imp_vldeducao', 'Dedução/desoneração, em %.', { confirmar: true }),
      dec('percentualDiferimento', 'imp_pcdifparcicms', 'Percentual de diferimento, em %.'),
      dec('percentualFecoep', 'imp_pcfecoep', 'Percentual do fundo de combate à pobreza (FECOEP), em %.'),
      flag('retencao', 'imp_retencao', 'Imposto retido.', '0 = não, 1 = sim', { confirmar: true }),
      txt('beneficioFiscal', 'imp_cbenef', 10, 'Código de benefício fiscal (cBenef).'),
      txt('beneficioFiscal1', 'imp_cbenef1', 10, 'Código de benefício fiscal adicional 1.'),
      txt('beneficioFiscal2', 'imp_cbenef2', 10, 'Código de benefício fiscal adicional 2.'),
      txt('beneficioFiscal3', 'imp_cbenef3', 10, 'Código de benefício fiscal adicional 3.'),
      txt('beneficioFiscal4', 'imp_cbenef4', 10, 'Código de benefício fiscal adicional 4.'),
      txt('beneficioFiscal5', 'imp_cbenef5', 10, 'Código de benefício fiscal adicional 5.'),
      txt('beneficioFiscal6', 'imp_cbenef6', 10, 'Código de benefício fiscal adicional 6.'),
      txt('beneficioFiscal7', 'imp_cbenef7', 10, 'Código de benefício fiscal adicional 7.'),
      txt('beneficioFiscal8', 'imp_cbenef8', 10, 'Código de benefício fiscal adicional 8.'),
      txt('beneficioFiscal9', 'imp_cbenef9', 10, 'Código de benefício fiscal adicional 9.'),
      txt('beneficioFiscal10', 'imp_cbenef10', 10, 'Código de benefício fiscal adicional 10.'),
      int('classificacaoTributaria', 'imp_cclasstrib', 'Classificação tributária da Reforma Tributária (CBS/IBS), 6 dígitos.'),
      dec('valorAliquota', 'imp_valaliq', 'Valor fixo da alíquota (Reforma Tributária).', { confirmar: true }),
      dec('reducaoAliquota', 'imp_predaliq', 'Redução da alíquota, em % (Reforma Tributária).'),
      int('codigoCreditoPresumido', 'imp_ccredpres', 'Código do crédito presumido (Reforma Tributária).'),
      dec('percentualCreditoPresumido', 'imp_pcredpres', 'Percentual do crédito presumido, em %.'),
      flag('creditoPresumidoSuspensivo', 'imp_credpressus', 'Crédito presumido em suspensão.', '0 = não, 1 = sim'),
      int('codigoRegular', 'imp_codregular', 'Código do regime regular (Reforma Tributária).', { confirmar: true }),
      dec('aliquotaRegular', 'imp_regpcaliq', 'Alíquota do regime regular, em %.'),
      int('cstRegular', 'imp_regtriicm', 'CST do regime regular.'),
      int('classificacaoRegular', 'imp_regcclasstrib', 'Classificação tributária do regime regular.'),
      txt('tipoCalculo', 'imp_tipocalc', 10, 'Tipo de cálculo (Reforma Tributária).', { confirmar: true }),
      txt('medida', 'imp_medida', 10, 'Unidade de medida da alíquota (Reforma Tributária).', { confirmar: true }),
      int('indicadorGibsCbs', 'ind_gibscbs', 'Indicador de IBS/CBS.', { confirmar: true }),
      int('indicadorDiferimento', 'ind_gdif', 'Indicador de diferimento.', { confirmar: true }),
      txt('observacao', 'imp_observacao', 500, 'Observação da regra.'),
    ],
    exemplo: { codigo: 1, tipoImposto: 1, natureza: 5102, empresa: 1, filial: 1, ufOrigem: 'MT', ufDestino: 'MT', ncm: 0, procedencia: 0, vigenciaInicio: '2024-01-01', cst: 0, aliquota: 17, reducaoBase: 0 },
  },
];

// Recursos que ainda nao tem contrato publico, e por que (aparecem na documentacao).
export const emDefinicao: { entidade: NomeEntidade; motivo: string }[] = [
  { entidade: 'users', motivo: 'Envolve senha: falta decidir como ela trafega e fica guardada (hoje o PDV grava md5 na importação).' },
];

// Cadastros COMUNS a todos os clientes: unicos no Hub (nao sao enviados por cliente/PDV pela API).
// Os terminais continuam recebendo pela sincronizacao normal (/v1/sync/{entidade}).
export const entidadesComuns: { entidade: NomeEntidade; motivo: string }[] = [
  { entidade: 'cities', motivo: 'Cadastro único de cidades (carga pela API do IBGE; o código é o do PDV/Agrosys e o IBGE fica em outra coluna). Consulte em Hub > Cidades.' },
];
export const ehComum = (entidade: string) => entidadesComuns.some((c) => c.entidade === entidade);

export const contratoPorCaminho = (c: string) => contratos.find((x) => x.caminho === c);
export const contratoDaEntidade = (e: string) => contratos.find((x) => x.entidade === e);
export const caminhosPublicos = contratos.map((c) => c.caminho);

// ---- validacao externa --------------------------------------------------------------------------
function zodDoCampo(c: CampoContrato): z.ZodTypeAny {
  let z0: z.ZodTypeAny;
  if (c.conversao) z0 = z.union([z.literal(0), z.literal(1)]);
  else if (c.tipo === 'inteiro') z0 = z.number().int();
  else if (c.tipo === 'decimal') z0 = z.number();
  else if (c.tipo === 'data') z0 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD');
  else z0 = z.string().max(c.tamanho ?? 255);
  return c.obrigatorio ? z0 : z0.nullable().optional();
}

// Estrito: campo desconhecido e recusado (o contrato e a unica porta de entrada).
export function schemaExterno(c: Contrato) {
  return z.object(Object.fromEntries(c.campos.map((f) => [f.nome, zodDoCampo(f)]))).strict();
}

const paraLegadoValor = (f: CampoContrato, v: unknown): unknown => {
  if (v === null || v === undefined) return null;
  if (f.conversao === 'flag01') return v === 1;
  if (f.conversao === 'simnao') return v === 1 ? 'yes' : 'no';
  return v;
};
const paraExternoValor = (f: CampoContrato, v: unknown): unknown => {
  if (v === null || v === undefined) return null;
  if (f.conversao === 'flag01') return v === true || v === 'true' || v === 1 || v === 'yes' ? 1 : 0;
  if (f.conversao === 'simnao') return v === true || v === 'true' || v === 'yes' || v === 1 ? 1 : 0;
  if (f.tipo === 'inteiro' || f.tipo === 'decimal') return typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return v;
};

// contrato externo -> linha no formato do terminal (so os campos enviados)
export function paraLegado(c: Contrato, externo: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of c.campos) if (f.nome in externo) out[f.legado] = paraLegadoValor(f, externo[f.nome]);
  return out;
}

// linha do terminal -> contrato externo (exemplos, leituras)
export function paraExterno(c: Contrato, legado: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of c.campos) if (f.legado in legado) out[f.nome] = paraExternoValor(f, legado[f.legado]);
  return out;
}

// confere que o contrato esta coerente com o catalogo: colunas existem e as chaves sao obrigatorias
export function verificarContrato(c: Contrato): string[] {
  const erros: string[] = [];
  const ent = entidades[c.entidade];
  const campos = Object.keys(ent.schema.shape);
  for (const f of c.campos) {
    if (!campos.includes(f.legado)) erros.push(`${c.caminho}.${f.nome}: coluna ${f.legado} nao existe em ${ent.tabelaLegada}`);
  }
  for (const k of ent.chave) {
    const f = c.campos.find((x) => x.legado === k);
    if (!f) erros.push(`${c.caminho}: chave ${k} sem campo no contrato`);
    else if (!f.obrigatorio) erros.push(`${c.caminho}.${f.nome}: chave deve ser obrigatoria`);
  }
  const nomes = c.campos.map((f) => f.nome);
  if (new Set(nomes).size !== nomes.length) erros.push(`${c.caminho}: nomes repetidos`);
  return erros;
}

// PATCH: so os campos enviados (todos opcionais). A chave nao muda: se vier, tem de ser a mesma.
export function schemaParcial(c: Contrato) {
  return z.object(Object.fromEntries(c.campos.map((f) => [f.nome, zodDoCampo({ ...f, obrigatorio: false })]))).strict();
}

// Campos que identificam o registro, com os nomes externos (devolvidos na resposta do POST).
export function chaveExterna(c: Contrato, legado: Record<string, unknown>): Record<string, unknown> {
  return paraExterno({ ...c, campos: c.campos.filter((f) => f.obrigatorio) }, legado);
}
