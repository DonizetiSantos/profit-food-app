import { Transaction, Category } from "../types";

export interface FinancialAnalysisData {
  summary: string;
  kpis: {
    label: string;
    value: string;
    status: "success" | "warning" | "danger";
    benchmark: string;
    description: string;
  }[];
  stability: {
    breakEven: string;
    safetyMargin: string;
    safetyMarginStatus: "success" | "warning" | "danger";
  };
  criticalAlerts: string[];
  recommendations: string[];
  healthScore: number;
}

/**
 * Chama a API server-side no Vercel (NÃO expõe GEMINI_API_KEY no navegador).
 */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await r.json().catch(() => ({}));

  if (!r.ok) {
    const msg =
      payload?.error ||
      payload?.details ||
      `Erro na API (${r.status}).`;
    throw new Error(msg);
  }

  return payload as T;
}

export const getFinancialAdvice = async (
  transactions: Transaction[],
  categories: Category[]
): Promise<string> => {
  const transactionSummary = transactions
    .slice(-15)
    .map((t) => {
      const cat =
        categories.find((c) => c.id === t.categoryId)?.name || "Sem categoria";
      return `- ${t.date}: ${t.description} (${cat}) - R$ ${t.amount} [${t.type}]`;
    })
    .join("\n");

  const prompt = `
Analise as seguintes transações financeiras recentes de um restaurante e forneça 3 dicas práticas baseadas no Método Profit Food:

${transactionSummary}
`.trim();

  try {
    // Endpoint de TEXTO (simples)
    const data = await postJson<{ text: string }>("/api/gemini-advice", { prompt });
    return data.text || "Não foi possível gerar uma análise no momento.";
  } catch (error) {
    console.error("Erro no consultor IA:", error);
    return "Desculpe, ocorreu um erro ao processar sua análise financeira.";
  }
};

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
- Outras Saídas (Dívidas/Amortização): R$ ${dreData.saidasNaoOperacionais}

TABELA DE BENCHMARKS PROFITFOOD (USE PARA CLASSIFICAR STATUS):
- CMV: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
- Margem de Contribuição (%): Ideal >= 40% | Atenção 37-39.9% | Crítico < 37%
- Pessoal / Vendas Brutas: Ideal <= 25% | Atenção 25.1-28% | Crítico > 28%
- Despesas Fixas / Vendas Brutas: Ideal <= 35% | Atenção 35.1-38% | Crítico > 38%
- Margem de Segurança (%): Seguro > 20% | Atenção 10-20% | Crítico < 10%
- Lucratividade: Ideal > 10% | Crítico < 7%

REGRAS DE RETORNO:
1. breakEven: Apenas o valor em Reais (Ex: R$ 85.000). Cálculo: Fixas / (MC/Vendas Brutas).
2. summary: Texto consultivo, citando hipóteses (Ex: se MC caiu, investigar precificação ou desperdício).
3. healthScore: Nota de 0 a 100 baseada na média dos indicadores.
4. Todos os percentuais devem ser citados como "pontos percentuais".
`.trim();

  try {
    // Endpoint de JSON (com schema)
    return await postJson<FinancialAnalysisData>("/api/gemini-financial", { prompt });
  } catch (error) {
    console.error("Erro na análise técnica IA:", error);
    throw error;
  }
};
