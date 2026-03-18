import { Transaction, Category } from "../types";

export interface FinancialAnalysisData {
  summary: string;
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

// 🔹 CONSULTORIA SIMPLES
export const getFinancialAdvice = async (
  transactions: Transaction[],
  categories: Category[]
): Promise<string> => {

  const transactionSummary = transactions.slice(-15).map(t => {
    const cat = categories.find(c => c.id === t.categoryId)?.name || 'Sem categoria';
    return `- ${t.date}: ${t.description} (${cat}) - R$ ${t.amount} [${t.type}]`;
  }).join('\n');

  const prompt = `
Analise as seguintes transações financeiras recentes de um restaurante e forneça 3 dicas práticas baseadas no Método Profit Food:

${transactionSummary}
  `;

  try {
    const response = await fetch("/api/gemini-advice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Erro na API");
    }

    return data.text || "Não foi possível gerar uma análise.";
  } catch (error) {
    console.error("Erro no consultor IA:", error);
    return "Erro ao gerar recomendação.";
  }
};

// 🔹 ANÁLISE COMPLETA (DRE)
export const getDetailedFinancialAnalysis = async (
  dreData: any,
  dashboardStats: any,
  period: string
): Promise<FinancialAnalysisData> => {

  const prompt = `
Como o Assistente de Diagnóstico Financeiro ProfitFood, elabore um PARECER CONSULTIVO para ${period}.

DADOS DO PERÍODO:
- Vendas Brutas: R$ ${dreData.faturamentoBruto}
- Impostos: R$ ${dreData.impostos}
- Despesas Variáveis Vendas: R$ ${dreData.variaveisVendas}
- CMV (Custo Mercadoria): R$ ${dreData.cmv}
- Margem de Contribuição (R$): R$ ${dreData.lucroBruto}
- Despesa com Pessoal: R$ ${dreData.pessoal}
- Despesas Fixas Totais: R$ ${dreData.totalDespesasFixas}
- Resultado Líquido: R$ ${dreData.resultadoLiquido}
- Outras Saídas: R$ ${dreData.saidasNaoOperacionais}
  `;

  try {
    const response = await fetch("/api/gemini-financial", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro backend:", data);
      throw new Error(data?.error || "Erro ao gerar análise");
    }

    return data as FinancialAnalysisData;

  } catch (error) {
    console.error("Erro na análise técnica IA:", error);
    throw error;
  }
};
