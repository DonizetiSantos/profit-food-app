
import { Transaction, Category } from "../types";

export interface FinancialAnalysisData {
  summary: string;
  scoreExplanation: string;
  whatIfNothingIsDone: string;
  recoveryOpportunity: string;
  kpis: {
    label: string;
    value: string;
    status: 'success' | 'warning' | 'danger';
    benchmark: string;
    description: string;
  }[];
  stability: {
    breakEven: string;
    safetyMargin: string;
    safetyMarginStatus: 'success' | 'warning' | 'danger';
  };
  criticalAlerts: string[];
  recommendations: string[];
  healthScore: number;
}

export const getFinancialAdvice = async (transactions: Transaction[], categories: Category[]): Promise<string> => {
  const transactionSummary = transactions.slice(-15).map(t => {
    const cat = categories.find(c => c.id === t.categoryId)?.name || 'Sem categoria';
    return `- ${t.date}: ${t.description} (${cat}) - R$ ${t.amount} [${t.type}]`;
  }).join('\n');

  const prompt = `
    Analise as seguintes transações financeiras recentes de um restaurante e forneça 3 dicas práticas baseadas no Método Profit Food:
    
    ${transactionSummary}
  `;

  try {
    const response = await fetch('/api/gemini-financial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemInstruction: "Você é o Assistente de Diagnóstico Financeiro ProfitFood. Sua linguagem deve ser consultiva, provocativa e clara. Foque em eficiência operacional e gestão de margens.",
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Erro ao gerar análise.");
    }

    const data = await response.json();
    return data.text || "Não foi possível gerar uma análise no momento.";
  } catch (error) {
    console.error("Erro no consultor IA:", error);
    return "Não foi possível gerar a análise no momento. Tente novamente em instantes.";
  }
};

export const getDetailedFinancialAnalysis = async (dreData: any, dashboardStats: any, period: string): Promise<FinancialAnalysisData> => {
  const prompt = `
    Como o Assistente de Diagnóstico Financeiro ProfitFood, elabore um PARECER CONSULTIVO PREMIUM de nível sênior para o período ${period}.

    Seu papel não é apenas comentar números.
    Seu papel é diagnosticar a saúde financeira da operação, mostrar onde o dinheiro está sendo perdido, medir o impacto estimado em reais e priorizar ações com lógica financeira consistente.

    ==================================================
    DADOS DO PERÍODO
    ==================================================
    - Vendas Brutas: R$ ${dreData.faturamentoBruto}
    - Impostos: R$ ${dreData.impostos}
    - Despesas Variáveis Vendas: R$ ${dreData.variaveisVendas}
    - CMV (Custo Mercadoria): R$ ${dreData.cmv}
    - Margem de Contribuição (R$): R$ ${dreData.lucroBruto}
    - Despesa com Pessoal: R$ ${dreData.pessoal}
    - Despesas Fixas Totais: R$ ${dreData.totalDespesasFixas}
    - Resultado Líquido: R$ ${dreData.resultadoLiquido}
    - Outras Saídas (Dívidas/Amortização): R$ ${dreData.saidasNaoOperacionais}

    ==================================================
    BENCHMARKS PROFIT FOOD (USO OBRIGATÓRIO)
    ==================================================
    - CMV: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
    - Margem de Contribuição (%): Ideal >= 40% | Atenção 37-39.9% | Crítico < 37%
    - Pessoal / Vendas Brutas: Ideal <= 25% | Atenção 25.1-28% | Crítico > 28%
    - Despesas Fixas / Vendas Brutas: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
    - Margem de Segurança (%): Seguro > 20% | Atenção 10-20% | Crítico < 10%
    - Lucratividade: Ideal > 10% | Crítico < 7%

    ==================================================
    REGRAS MESTRAS DE CÁLCULO INTERPRETATIVO
    ==================================================

    1. VOCÊ DEVE USAR SOMENTE OS DADOS FORNECIDOS
    - Não invente indicadores.
    - Não invente percentuais não sustentados.
    - Não crie ganhos irreais.
    - Não arredonde excessivamente.
    - Use valores específicos, por exemplo:
      R$ 5.724,00
      e não:
      R$ 6.000,00

    2. TODO DESVIO DEVE SER MEDIDO CONTRA O IDEAL, NÃO CONTRA O LIMITE CRÍTICO
    Exemplo:
    - Se CMV atual for 41,8% e o ideal for 35%, o desvio correto é 6,8 pontos percentuais.
    - Sempre explicitar o GAP quando houver desvio relevante.
    Frase esperada:
    "Esse indicador está X pontos percentuais acima/abaixo do referencial ideal."

    3. IMPACTO FINANCEIRO EM R$ É OBRIGATÓRIO PARA INDICADORES FORA DO IDEAL
    Fórmula base:
    Impacto estimado = Vendas Brutas x desvio percentual em relação ao benchmark ideal

    Exemplo conceitual:
    Se o CMV está 6,8 pontos acima do ideal, então:
    impacto estimado = vendas brutas x 6,8%

    Frase obrigatória:
    "Esse desvio representa aproximadamente R$ X no resultado do período."

    4. NÃO PODE HAVER INCONSISTÊNCIA ENTRE OPORTUNIDADE TOTAL E PLANO DE AÇÃO
    Regra crítica:
    - A recoveryOpportunity representa o potencial total consolidado de recuperação mensal.
    - As recomendações NÃO podem somar ganhos independentes acima desse total se estiverem atacando o mesmo problema.
    - Se várias ações corrigem o mesmo desvio, trate como ações complementares e não como ganhos acumulativos separados.
    - Não duplicar benefício financeiro.
    - Não superdimensionar recuperação.

    Exemplo de regra:
    Se o principal problema é CMV e a recuperação consolidada estimada é R$ 5.724,00/mês, o plano de ação não pode sugerir três ações que somadas deem R$ 12.000,00/mês, a menos que existam desvios independentes claramente distintos e sustentados pelos dados.

    5. RECOMENDAÇÕES DEVEM SER PRIORIZADAS POR IMPACTO E URGÊNCIA
    A ordem das recomendações deve seguir:
    - primeiro: maior impacto financeiro consolidado
    - segundo: maior urgência operacional
    - terceiro: ações de sustentação

    6. LINGUAGEM
    - consultiva
    - executiva
    - firme
    - profissional
    - sem sensacionalismo
    - sem exagero teatral
    - sem linguagem vaga

    Você pode ser contundente, mas com elegância técnica.

    ==================================================
    ESTRUTURA OBRIGATÓRIA DE CONTEÚDO
    ==================================================

    A) SUMMARY
    Monte um parecer executivo forte, em um único texto, contendo obrigatoriamente:
    1. Visão geral do período
    2. Principal desvio financeiro
    3. GAP percentual contra o ideal
    4. Impacto estimado em R$
    5. Consequência sobre lucro, margem ou caixa
    6. Fechamento estratégico com senso de urgência executiva

    O summary deve soar como parecer de consultor sênior.
    Não use tópicos.
    Não seja genérico.

    B) SCORE EXPLANATION
    Explique o score com base nesta lógica:
    - 0 a 39: operação em risco real
    - 40 a 69: operação em atenção com desequilíbrios relevantes
    - 70 a 100: operação saudável, com boa absorção de custos

    A explicação deve mencionar a causa principal da nota.

    C) WHAT IF NOTHING IS DONE
    Explique a consequência financeira prática de manter os desvios.
    Obrigatório:
    - perda mensal estimada
    - perda anual estimada
    - consequência operacional

    Frase modelo esperada:
    "Se nada for feito, esse desvio pode continuar consumindo aproximadamente R$ X por mês, acumulando R$ Y por ano e reduzindo a capacidade de geração de caixa da operação."

    D) RECOVERY OPPORTUNITY
    Traga uma visão CONSOLIDADA do potencial de recuperação mensal.
    Importante:
    - não duplicar oportunidades
    - não somar causas iguais duas vezes
    - se houver apenas um desvio principal, a oportunidade deve refletir esse desvio central
    - se houver mais de um desvio independente, pode consolidar, mas com coerência

    E) KPIs
    Para cada KPI:
    - label
    - value
    - status
    - benchmark
    - description

    Regras:
    - Se o indicador estiver fora do ideal, a descrição deve mencionar:
      1. situação do indicador
      2. gap percentual contra o ideal
      3. impacto estimado em R$
      4. consequência prática
    - Se estiver saudável, a descrição deve mostrar como ele protege a operação, a margem ou o caixa

    Proibido escrever descrições genéricas como:
    "indicando ineficiência"
    "merece atenção"
    "situação preocupante"
    sem traduzir isso em dinheiro ou consequência.

    F) STABILITY
    Retorne:
    - breakEven
    - safetyMargin
    - safetyMarginStatus

    A leitura da margem de segurança deve refletir o benchmark Profit Food.

    G) CRITICAL ALERTS
    Alertas curtos, diretos e objetivos.
    Sem exagero.
    Sem frases vazias.
    Devem destacar o que realmente ameaça a operação.

    H) RECOMMENDATIONS
    Cada recomendação deve:
    - ser específica
    - corrigir um problema real detectado
    - mencionar impacto estimado em R$
    - manter coerência com a recoveryOpportunity
    - vir em ordem de prioridade

    Formato esperado de conteúdo:
    "Ação prática + problema que corrige + impacto financeiro estimado + consequência positiva."

    ==================================================
    REGRAS DE COERÊNCIA FINAL (OBRIGATÓRIAS)
    ==================================================

    Antes de responder, confira internamente se:
    1. O principal problema do summary é o mesmo refletido nos alertas.
    2. O impacto em R$ citado no summary é coerente com o KPI principal.
    3. O whatIfNothingIsDone usa base coerente com o impacto mensal.
    4. A recoveryOpportunity não contradiz as recommendations.
    5. As recommendations não prometem mais ganho do que o desvio permite recuperar.
    6. Os textos não estão genéricos.
    7. O JSON está 100% válido.

    ==================================================
    ESTRUTURA JSON OBRIGATÓRIA
    ==================================================

    {
      "summary": "string",
      "scoreExplanation": "string",
      "whatIfNothingIsDone": "string",
      "recoveryOpportunity": "string",
      "kpis": [
        {
          "label": "string",
          "value": "string",
          "status": "success|warning|danger",
          "benchmark": "string",
          "description": "string"
        }
      ],
      "stability": {
        "breakEven": "string",
        "safetyMargin": "string",
        "safetyMarginStatus": "success|warning|danger"
      },
      "criticalAlerts": ["string"],
      "recommendations": ["string"],
      "healthScore": number
    }
  `;

  try {
    const response = await fetch('/api/gemini-financial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemInstruction: "Você é o Assistente de Diagnóstico Financeiro ProfitFood. Retorne APENAS um JSON válido. Use os benchmarks ProfitFood rigorosamente. CRITICAL: Sempre traduza desvios e ações sugeridas em impacto financeiro estimado (R$) seguindo as regras de conteúdo premium.",
        responseSchema: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Erro ao gerar análise.");
    }

    return await response.json();
  } catch (error) {
    console.error("Erro na análise técnica IA:", error);
    throw new Error("Não foi possível gerar a análise no momento. Tente novamente em instantes.");
  }
};
