
import { MainGroup, Subgroup, Account } from './types';

export const INITIAL_SUBGROUPS: Subgroup[] = [
  // RECEITAS
  { id: 's-entradas-op', name: 'ENTRADAS OPERACIONAIS', groupId: MainGroup.RECEITAS },
  { id: 's-entradas-nao-op', name: 'ENTRADAS NÃO OPERACIONAIS', groupId: MainGroup.RECEITAS },
  
  // DESPESAS
  { id: 's-impostos', name: 'IMPOSTOS', groupId: MainGroup.DESPESAS },
  { id: 's-despesas-vendas', name: 'DESPESAS COM VENDAS', groupId: MainGroup.DESPESAS },
  { id: 's-despesa-pessoal', name: 'DESPESA COM PESSOAL', groupId: MainGroup.DESPESAS },
  { id: 's-despesas-admin', name: 'DESPESAS ADMINISTRATIVAS', groupId: MainGroup.DESPESAS },
  { id: 's-despesas-ocupacao', name: 'DESPESAS DE OCUPAÇÃO', groupId: MainGroup.DESPESAS },
  { id: 's-despesas-financeiras', name: 'DESPESAS FINANCEIRAS', groupId: MainGroup.DESPESAS },
  { id: 's-saidas-nao-op', name: 'SAÍDAS NÃO OPERACIONAIS', groupId: MainGroup.DESPESAS },
  { id: 's-investimentos', name: 'INVESTIMENTOS', groupId: MainGroup.DESPESAS },
  { id: 's-despesas-compras', name: 'DESPESAS COM COMPRAS', groupId: MainGroup.DESPESAS },
];

export const INITIAL_ACCOUNTS: Account[] = [
  // --- RECEITAS ---
  // Entradas Operacionais
  { id: 'acc-vendas-gerais', name: 'VENDAS GERAIS', subgroupId: 's-entradas-op', groupId: MainGroup.RECEITAS },
  { id: 'acc-rec-cartao-cred', name: 'RECEBIMENTO CARTÃO CRÉDITO', subgroupId: 's-entradas-op', groupId: MainGroup.RECEITAS },
  { id: 'acc-rec-cartao-deb', name: 'RECEBIMENTO CARTÃO DÉBITO', subgroupId: 's-entradas-op', groupId: MainGroup.RECEITAS },
  { id: 'acc-rec-voucher', name: 'RECEBIMENTO VOUCHER', subgroupId: 's-entradas-op', groupId: MainGroup.RECEITAS },
  
  // Entradas Não Operacionais
  { id: 'acc-aporte-socios', name: 'APORTE SÓCIOS', subgroupId: 's-entradas-nao-op', groupId: MainGroup.RECEITAS },
  { id: 'acc-emprestimos-ent', name: 'EMPRÉSTIMOS', subgroupId: 's-entradas-nao-op', groupId: MainGroup.RECEITAS },

  // --- DESPESAS ---
  // Impostos
  { id: 'acc-simples-nacional', name: 'SIMPLES NACIONAL', subgroupId: 's-impostos', groupId: MainGroup.DESPESAS },

  // Despesas com Vendas
  { id: 'acc-comissao', name: 'COMISSÃO', subgroupId: 's-despesas-vendas', groupId: MainGroup.DESPESAS },
  { id: 'acc-devolucao-pedidos', name: 'DEVOLUÇÃO DE PEDIDOS', subgroupId: 's-despesas-vendas', groupId: MainGroup.DESPESAS },
  { id: 'acc-diaria-motoboy', name: 'DIÁRIA MOTOBOY', subgroupId: 's-despesas-vendas', groupId: MainGroup.DESPESAS },
  { id: 'acc-taxa-aplicativo', name: 'TAXA APLICATIVO', subgroupId: 's-despesas-vendas', groupId: MainGroup.DESPESAS },
  { id: 'acc-taxa-entrega', name: 'TAXA DE ENTREGA', subgroupId: 's-despesas-vendas', groupId: MainGroup.DESPESAS },
  { id: 'acc-taxas-cartoes', name: 'TAXAS CARTÕES', subgroupId: 's-despesas-vendas', groupId: MainGroup.DESPESAS },

  // Despesa com Pessoal
  { id: 'acc-13-salario', name: '13º SALÁRIO', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-adiantamento-salarial', name: 'ADIANTAMENTO SALARIAL', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-assistencia-medica', name: 'ASSISTÊNCIA MEDICO HOSPITALAR', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-exame-dem-adm', name: 'EXAME DEMISSIONAL/ADMISSIONAL', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-ferias', name: 'FÉRIAS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-fgts', name: 'FGTS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-free-lance', name: 'FREE LANCE', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-inss', name: 'INSS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-processo-trabalhista', name: 'PROCESSO E AÇÕES TRABALHISTAS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-prolabore', name: 'PROLABORE', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-prov-13-ferias', name: 'PROVISIONAMENTO 1/3 DE FÉRIAS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-prov-13-salario', name: 'PROVISIONAMENTO 13º SALÁRIO', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-rescisoes', name: 'RESCISÕES TRABALHISTAS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-salarios', name: 'SALARIOS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-seguro-func', name: 'SEGUROS FUNCIONÁRIOS', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-sindicato', name: 'SINDICATO CATEGORIA', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-uniforme-epi', name: 'UNIFORME / EPI', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-vale-alimentacao', name: 'VALE ALIMENTAÇÃO', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },
  { id: 'acc-vale-transporte', name: 'VALE TRANSPORTE', subgroupId: 's-despesa-pessoal', groupId: MainGroup.DESPESAS },

  // Despesas Administrativas
  { id: 'acc-advocacia', name: 'ADVOCACIA', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-assessoria-tecnica', name: 'ASSESSORIA TÉCNICA', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-combustivel', name: 'COMBUSTÍVEL', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-confraternizacoes', name: 'CONFRATERNIZAÇÕES', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-consultorias', name: 'CONSULTORIAS E TREINAMENTOS', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-contabilidade', name: 'CONTABILIDADE', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-doacoes', name: 'DOAÇÕES', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-eventos', name: 'EVENTOS', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-grafica', name: 'GRÁFICA', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-internet', name: 'INTERNET: PROVEDOR, BANDA LARGA, SIT', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-copa-cozinha', name: 'MATERIAIS DE COPA E COZINHA', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-escritorio', name: 'MATERIAIS DE ESCRITÓRIO', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-propaganda', name: 'PROPAGANDA E PUBLICIDADE', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-refeicoes-lanches', name: 'REFEIÇÕES E LANCHES', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-seguranca', name: 'SEGURANÇA', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-servicos-rh', name: 'SERVIÇOS DE RH', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-servicos-limpeza', name: 'SERVIÇOS LIMPEZA', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-monitoramento', name: 'SISTEMA DE MONITORAMENTO', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-software', name: 'SOFTWARE', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },
  { id: 'acc-viagens', name: 'VIAGENS, ESTADIAS E REFEIÇÕES', subgroupId: 's-despesas-admin', groupId: MainGroup.DESPESAS },

  // Despesas de Ocupação
  { id: 'acc-agua-esgoto', name: 'ÁGUA/ESGOTO', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },
  { id: 'acc-aluguel-iptu', name: 'ALUGUEL / IPTU', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },
  { id: 'acc-detetizacao', name: 'DETETIZAÇÃO', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },
  { id: 'acc-energia-eletrica', name: 'ENERGIA ELÉTRICA', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },
  { id: 'acc-manutencao-inst', name: 'MANUTENÇÃO DE INSTALAÇÕES E MÁQUI', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },
  { id: 'acc-limpeza-higiene', name: 'MATERIAIS DE LIMPEZA E HIGIENE', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },
  { id: 'acc-seguros-equip', name: 'SEGUROS EQUIPAMENTOS E LOCAL', subgroupId: 's-despesas-ocupacao', groupId: MainGroup.DESPESAS },

  // Despesas Financeiras
  { id: 'acc-iof', name: 'IOF', subgroupId: 's-despesas-financeiras', groupId: MainGroup.DESPESAS },
  { id: 'acc-juros-ant', name: 'JUROS ANTECIPAÇÃO', subgroupId: 's-despesas-financeiras', groupId: MainGroup.DESPESAS },
  { id: 'acc-juros-atraso', name: 'JUROS ATRASOS PAGTOS', subgroupId: 's-despesas-financeiras', groupId: MainGroup.DESPESAS },
  { id: 'acc-juros-pagos', name: 'JUROS PAGOS', subgroupId: 's-despesas-financeiras', groupId: MainGroup.DESPESAS },
  { id: 'acc-tarifas-bancarias', name: 'TARIFAS BANCÁRIAS', subgroupId: 's-despesas-financeiras', groupId: MainGroup.DESPESAS },

  // Saídas Não Operacionais
  { id: 'acc-pag-emprestimos', name: 'PAGAMENTO EMPRÉSTIMOS', subgroupId: 's-saidas-nao-op', groupId: MainGroup.DESPESAS },
  { id: 'acc-parc-impostos', name: 'PARCELAMENTO IMPOSTOS', subgroupId: 's-saidas-nao-op', groupId: MainGroup.DESPESAS },
  { id: 'acc-retiradas-socios', name: 'RETIRADAS SÓCIOS', subgroupId: 's-saidas-nao-op', groupId: MainGroup.DESPESAS },

  // Investimentos
  { id: 'acc-ampliacao-obras', name: 'AMPLIAÇÃO/OBRAS', subgroupId: 's-investimentos', groupId: MainGroup.DESPESAS },
  { id: 'acc-apl-financeiras', name: 'APLICAÇÕES FINANCEIRAS', subgroupId: 's-investimentos', groupId: MainGroup.DESPESAS },
  { id: 'acc-computadores', name: 'COMPUTADORES E EQUIP ELETRÔNICOS', subgroupId: 's-investimentos', groupId: MainGroup.DESPESAS },
  { id: 'acc-equip-cozinha', name: 'EQUIPAMENTOS E UTENSÍLIOS DE COZINH', subgroupId: 's-investimentos', groupId: MainGroup.DESPESAS },
  { id: 'acc-mobiliario', name: 'MOBILIÁRIO', subgroupId: 's-investimentos', groupId: MainGroup.DESPESAS },
  { id: 'acc-veiculos', name: 'VEÍCULOS', subgroupId: 's-investimentos', groupId: MainGroup.DESPESAS },

  // Despesas com Compras
  { id: 'acc-embalagens', name: 'EMBALAGENS', subgroupId: 's-despesas-compras', groupId: MainGroup.DESPESAS },
  { id: 'acc-materias-primas', name: 'MATÉRIAS-PRIMAS', subgroupId: 's-despesas-compras', groupId: MainGroup.DESPESAS },
  { id: 'acc-produtos-revenda', name: 'PRODUTOS DE REVENDA', subgroupId: 's-despesas-compras', groupId: MainGroup.DESPESAS },
  { id: 'acc-bebidas', name: 'BEBIDAS', subgroupId: 's-despesas-compras', groupId: MainGroup.DESPESAS },

  // --- ESTOQUE (FIXO) ---
  { id: 'e-inicial', name: 'ESTOQUE INICIAL', subgroupId: 'estoque-geral', groupId: MainGroup.ESTOQUE, isFixed: true },
  { id: 'e-final', name: 'ESTOQUE FINAL', subgroupId: 'estoque-geral', groupId: MainGroup.ESTOQUE, isFixed: true },
];
