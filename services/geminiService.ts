
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
    Como o Assistente de Diagnóstico Financeiro ProfitFood, elabore um PARECER CONSULTIVO PREMIUM para ${period}.
    Seu objetivo é elevar o valor percebido da entrega, traduzindo dados em dinheiro e urgência operacional.

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

    TABELA DE BENCHMARKS PROFITFOOD (USE PARA CLASSIFICAR STATUS):
    - CMV: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
    - Margem de Contribuição (%): Ideal >= 40% | Atenção 37-39.9% | Crítico < 37%
    - Pessoal / Vendas Brutas: Ideal <= 25% | Atenção 25.1-28% | Crítico > 28%
    - Despesas Fixas / Vendas Brutas: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
    - Margem de Segurança (%): Seguro > 20% | Atenção 10-20% | Crítico < 10%
    - Lucratividade: Ideal > 10% | Crítico < 7%

    REGRAS OBRIGATÓRIAS DE CONTEÚDO:

    1. IMPACTO FINANCEIRO EM R$:
       Sempre que um indicador estiver fora do ideal, inclua o impacto financeiro estimado em reais.
       Cálculo: Vendas Brutas * (valor atual % - benchmark ideal %).
       Linguagem obrigatória: "Esse desvio representa um impacto financeiro estimado de aproximadamente R$ X no resultado do período."

    2. SUMMARY (PARECER CONSULTIVO):
       Estrutura: 1. Visão geral do período; 2. Principal alerta; 3. Impacto em R$; 4. Consequência para margem/lucro/caixa; 5. Fechamento estratégico.

    3. SCORE GERAL (healthScore):
       Gere um 'scoreExplanation' baseado na faixa:
       - 0-39: "O score geral indica uma operação em risco elevado, com múltiplos indicadores pressionando margem e estrutura."
       - 40-69: "O score geral posiciona o negócio em zona de atenção, com sinais de desequilíbrio que exigem ação corretiva."
       - 70-100: "O score geral indica uma operação saudável, com boa capacidade de absorção de custos e geração de resultado."

    4. O QUE ACONTECE SE NADA FOR FEITO (whatIfNothingIsDone):
       Explique as consequências práticas da manutenção dos desvios. Traduza em perda de margem/caixa.
       Inclua impacto estimado mensal e anual.
       Ex: "Se nada for feito, o desvio atual do CMV pode continuar consumindo aproximadamente R$ X por mês do resultado, o que representa R$ Y ao ano em perda de eficiência operacional."

    5. OPORTUNIDADE DE RECUPERAÇÃO (recoveryOpportunity):
       Estimativa do quanto pode ser recuperado se as ações forem implementadas.
       Ex: "Com a correção dos principais desvios identificados, existe potencial de recuperação de aproximadamente R$ X por mês no resultado operacional."

    6. KPIs - TEXTO FORTE:
       Se fora do ideal: mencione benchmark, impacto no resultado e consequência operacional.
       Se saudável: destaque que protege a operação e reforça disciplina.

    7. PLANO DE AÇÃO:
       Conecte ação com dinheiro. Cada recomendação deve conter: Ação prática + Problema que corrige + Potencial de recuperação em R$ + Consequência positiva.

    8. REGRAS DE LINGUAGEM:
       - Tom consultivo, executivo, claro e profissional.
       - NÃO usar linguagem alarmista ou sensacionalista.
       - NÃO afirmar valores como exatos -> sempre usar: "impacto estimado" ou "potencial de ganho".

    ESTRUTURA JSON ESPERADA:
    {
      "summary": "string",
      "scoreExplanation": "string",
      "whatIfNothingIsDone": "string",
      "recoveryOpportunity": "string",
      "kpis": [
        { "label": "string", "value": "string", "status": "success|warning|danger", "benchmark": "string", "description": "string" }
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
