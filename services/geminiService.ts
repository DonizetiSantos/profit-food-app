
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, Category } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "Você é o Assistente de Diagnóstico Financeiro ProfitFood. Sua linguagem deve ser consultiva, provocativa e clara. Foque em eficiência operacional e gestão de margens.",
      }
    });

    return response.text || "Não foi possível gerar uma análise no momento.";
  } catch (error) {
    console.error("Erro no consultor IA:", error);
    return "Desculpe, ocorreu um erro ao processar sua análise financeira.";
  }
};

export const getDetailedFinancialAnalysis = async (dreData: any, dashboardStats: any, period: string): Promise<FinancialAnalysisData> => {
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
    2. summary: Texto consultivo profundo e profissional. Sempre que um indicador estiver fora do ideal, você DEVE incluir o IMPACTO FINANCEIRO ESTIMADO em R$ (Cálculo: Vendas Brutas * diferença percentual entre o valor atual e o ideal).
       ESTRUTURA OBRIGATÓRIA PARA DESVIOS:
       - Identificação do problema (Ex: CMV acima do ideal)
       - Explicação técnica (Ex: pressão nos custos de insumos)
       - Inclusão do impacto financeiro em R$ (Ex: impacto estimado de aproximadamente R$ X)
       - Consequência no resultado (Ex: perda de eficiência na gestão de compras)
       
       EXEMPLO DE SAÍDA: "O CMV encontra-se acima do limite ideal, indicando pressão direta sobre os custos e redução da margem operacional. Esse desvio representa um impacto estimado de aproximadamente R$ X no resultado do período, evidenciando perda de eficiência na gestão de compras ou produção."
    3. recommendations: Plano de ação prático. Cada item DEVE conter: Ação prática clara + Conexão com o problema + Impacto financeiro estimado (R$) + Consequência no resultado.
       EXEMPLO: "A renegociação com fornecedores aliada ao controle rigoroso de desperdícios pode recuperar aproximadamente R$ X no resultado mensal, corrigindo o desvio identificado no CMV e aumentando a eficiência operacional."
    4. healthScore: Nota de 0 a 100 baseada na média dos indicadores.
    5. Todos os percentuais devem ser citados como "pontos percentuais".
    6. REGRAS DE LINGUAGEM:
       - NÃO usar linguagem alarmista ou sensacionalista.
       - NÃO afirmar valores como exatos -> sempre usar: "impacto estimado" ou "potencial de ganho".
       - NÃO dizer que é prejuízo real -> tratar como potencial ou impacto no resultado.
       - Manter tom consultivo profissional (padrão Profit Food).
       - Sempre relacionar impacto com eficiência operacional.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: "Você é o Assistente de Diagnóstico Financeiro ProfitFood. Retorne APENAS um JSON válido. Use os benchmarks ProfitFood rigorosamente. CRITICAL: Sempre traduza desvios e ações sugeridas em impacto financeiro estimado (R$) no texto do 'summary', 'description' e 'recommendations', seguindo a estrutura obrigatória de conexão com resultado e eficiência operacional.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            stability: {
              type: Type.OBJECT,
              properties: {
                breakEven: { type: Type.STRING },
                safetyMargin: { type: Type.STRING },
                safetyMarginStatus: { type: Type.STRING }
              },
              required: ["breakEven", "safetyMargin", "safetyMarginStatus"]
            },
            kpis: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                  status: { type: Type.STRING },
                  benchmark: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["label", "value", "status", "benchmark"]
              }
            },
            criticalAlerts: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            healthScore: { type: Type.NUMBER }
          },
          required: ["summary", "stability", "kpis", "criticalAlerts", "recommendations", "healthScore"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Erro na análise técnica IA:", error);
    throw error;
  }
};
