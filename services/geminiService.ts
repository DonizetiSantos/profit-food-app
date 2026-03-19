
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

    Seu objetivo NÃO é descrever números.
    Seu objetivo é EXPOR a realidade financeira da operação, traduzindo tudo em dinheiro, impacto e decisão.

    ----------------------------------------
    DADOS DO PERÍODO:
    - Vendas Brutas: R$ ${dreData.faturamentoBruto}
    - Impostos: R$ ${dreData.impostos}
    - Despesas Variáveis Vendas: R$ ${dreData.variaveisVendas}
    - CMV (Custo Mercadoria): R$ ${dreData.cmv}
    - Margem de Contribuição (R$): R$ ${dreData.lucroBruto}
    - Despesa com Pessoal: R$ ${dreData.pessoal}
    - Despesas Fixas Totais: R$ ${dreData.totalDespesasFixas}
    - Resultado Líquido: R$ ${dreData.resultadoLiquido}
    - Outras Saídas (Dívidas/Amortização): R$ ${dreData.saidasNaoOperacionais}

    ----------------------------------------
    BENCHMARKS PROFIT FOOD (OBRIGATÓRIO USAR):
    - CMV: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
    - Margem de Contribuição (%): Ideal >= 40% | Atenção 37-39.9% | Crítico < 37%
    - Pessoal / Vendas Brutas: Ideal <= 25% | Atenção 25.1-28% | Crítico > 28%
    - Despesas Fixas / Vendas Brutas: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
    - Margem de Segurança (%): Seguro > 20% | Atenção 10-20% | Crítico < 10%
    - Lucratividade: Ideal > 10% | Crítico < 7%

    ----------------------------------------
    REGRAS CRÍTICAS (NÃO IGNORAR):

    1. IMPACTO EM DINHEIRO (OBRIGATÓRIO)
    Sempre que um indicador estiver fora do ideal:
    - Calcule o impacto financeiro REAL (NÃO arredonde)
    - Fórmula: Vendas Brutas * (desvio percentual)
    - Use números específicos (ex: R$ 7.842, não R$ 8.000)

    Frase obrigatória:
    "Esse desvio representa aproximadamente R$ X no resultado do período."

    ----------------------------------------

    2. SUMMARY (PARECER EXECUTIVO – FORTE)
    Estrutura obrigatória:
    1. Situação geral
    2. Principal problema
    3. Impacto em R$
    4. Consequência real (lucro / caixa / risco)
    5. Frase de fechamento estratégica (tom firme)

    Evite linguagem neutra.
    Use linguagem de decisão.

    ----------------------------------------

    3. SCORE (EXPLICAÇÃO)
    Baseie na nota (0–100):
    0–39 → operação em risco real
    40–69 → operação em atenção com desequilíbrios
    70–100 → operação saudável e controlada

    ----------------------------------------

    4. O QUE ACONTECE SE NADA FOR FEITO
    - Traduza em PERDA MENSAL e ANUAL
    - Sempre usar dinheiro
    Exemplo: "Esse cenário pode consumir aproximadamente R$ X/mês, acumulando R$ Y/ano."

    ----------------------------------------

    5. OPORTUNIDADE DE RECUPERAÇÃO
    - Some os principais desvios
    - Mostre quanto pode ser recuperado/mês

    ----------------------------------------

    6. KPIs (NÍVEL PROFISSIONAL)
    Para cada KPI:
    SE estiver fora:
    - mostrar benchmark
    - mostrar impacto em R$
    - mostrar consequência real
    SE estiver saudável:
    - mostrar que protege o lucro
    Proibido resposta genérica.

    ----------------------------------------

    7. PLANO DE AÇÃO (NÍVEL CIRÚRGICO)
    Cada recomendação DEVE conter:
    - ação prática específica
    - problema que corrige
    - impacto estimado em R$
    - consequência positiva
    Exemplo: "Ajustar preços em +3% nos itens de maior giro pode recuperar aproximadamente R$ X/mês, corrigindo a pressão de margem."

    ----------------------------------------

    8. PRIORIZAÇÃO (OBRIGATÓRIO)
    Ordene as ações por impacto financeiro (maior primeiro)

    ----------------------------------------

    9. ALERTAS CRÍTICOS
    Seja direto e firme, sem alarmismo.

    ----------------------------------------

    10. TOM DE LINGUAGEM
    - Consultivo
    - Executivo
    - Claro
    - Sem enrolação
    - Sem exagero emocional

    ----------------------------------------

    ESTRUTURA JSON (OBRIGATÓRIA):
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
