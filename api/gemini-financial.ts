import type { VercelRequest, VercelResponse } from '@vercel/node';

type KPIStatus = 'success' | 'warning' | 'danger';
type Priority = 'alta' | 'media' | 'baixa';
type Severity = 'alta' | 'media' | 'baixa';

interface FinancialAnalysisResponse {
  summary: string;
  score: {
    value: number;
    label: string;
    explanation: string;
  };
  kpis: Array<{
    label: string;
    value: string;
    status: KPIStatus;
    benchmark: string;
    description: string;
    impact: string;
  }>;
  stability: {
    breakEven: string;
    safetyMargin: string;
    operatingRisk: string;
    fixedCostPressure: string;
    commentary: string;
  };
  profitability: {
    grossMargin: string;
    contributionMargin: string;
    netMargin: string;
    cmv: string;
    commentary: string;
  };
  cashFlow: {
    currentPressure: string;
    receivablesProfile: string;
    payablesProfile: string;
    cashGenerationCapacity: string;
    commentary: string;
  };
  alerts: Array<{
    title: string;
    severity: Severity;
    description: string;
    financialImpact: string;
    action: string;
  }>;
  opportunities: Array<{
    title: string;
    description: string;
    financialImpact: string;
    action: string;
  }>;
  recommendations: Array<{
    priority: Priority;
    title: string;
    description: string;
    financialImpact: string;
    action: string;
  }>;
  actionPlan: Array<{
    priority: Priority;
    action: string;
    reason: string;
    expectedImpact: string;
    term: string;
  }>;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === 'number') {
        if (Number.isNaN(val)) return null;
        if (!Number.isFinite(val)) return null;
      }
      if (val instanceof Date) {
        return val.toISOString();
      }
      return val;
    },
    2
  );
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeText(value: unknown, fallback = 'Não informado'): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function normalizeStatus(value: unknown): KPIStatus {
  if (value === 'success' || value === 'warning' || value === 'danger') return value;
  return 'warning';
}

function normalizePriority(value: unknown): Priority {
  if (value === 'alta' || value === 'media' || value === 'baixa') return value;
  return 'media';
}

function normalizeSeverity(value: unknown): Severity {
  if (value === 'alta' || value === 'media' || value === 'baixa') return value;
  return 'media';
}

function buildFallbackResponse(rawData: unknown, reason?: string): FinancialAnalysisResponse {
  const payloadPreview =
    typeof rawData === 'object' && rawData !== null
      ? safeJsonStringify(rawData).slice(0, 1200)
      : String(rawData ?? '');

  return {
    summary:
      'Os dados foram recebidos com sucesso, mas a IA não conseguiu concluir a análise completa nesta tentativa. O motor financeiro continua sendo a fonte oficial dos números. Recomenda-se repetir a solicitação para gerar o parecer consultivo completo.',
    score: {
      value: 50,
      label: 'Atenção',
      explanation:
        reason ||
        'Não foi possível consolidar a interpretação completa da IA nesta tentativa, embora os dados estruturados tenham sido recebidos pelo endpoint.'
    },
    kpis: [
      {
        label: 'Status da análise',
        value: 'Parcial',
        status: 'warning',
        benchmark: 'Esperado: análise completa',
        description:
          'O endpoint recebeu os dados, mas a resposta estruturada da IA não pôde ser normalizada totalmente.',
        impact: 'Impacto financeiro não quantificado nesta tentativa'
      }
    ],
    stability: {
      breakEven: 'Não informado',
      safetyMargin: 'Não informado',
      operatingRisk: 'Moderado',
      fixedCostPressure: 'Não informado',
      commentary:
        'Sem a interpretação completa da IA, a leitura consultiva de estabilidade ficou parcial.'
    },
    profitability: {
      grossMargin: 'Não informado',
      contributionMargin: 'Não informado',
      netMargin: 'Não informado',
      cmv: 'Não informado',
      commentary:
        'A lucratividade deve ser lida diretamente pelos indicadores calculados no motor financeiro até nova tentativa.'
    },
    cashFlow: {
      currentPressure: 'Não informado',
      receivablesProfile: 'Não informado',
      payablesProfile: 'Não informado',
      cashGenerationCapacity: 'Não informado',
      commentary:
        'A capacidade de geração de caixa não pôde ser detalhada nesta resposta automática.'
    },
    alerts: [
      {
        title: 'Análise consultiva incompleta',
        severity: 'media',
        description:
          'A IA não retornou o JSON final no formato esperado nesta tentativa.',
        financialImpact: 'Impacto financeiro não quantificado',
        action: 'Executar nova tentativa de análise com os mesmos dados.'
      }
    ],
    opportunities: [
      {
        title: 'Nova execução da análise',
        description:
          'Os dados já chegaram ao endpoint, então a nova execução tende a concluir o parecer sem necessidade de alterar o motor financeiro.',
        financialImpact: 'Potencial de recuperar a leitura consultiva completa',
        action: 'Reprocessar a análise.'
      }
    ],
    recommendations: [
      {
        priority: 'alta',
        title: 'Reprocessar a análise',
        description:
          'Faça uma nova chamada ao endpoint usando exatamente os mesmos dados estruturados.',
        financialImpact: 'Sem impacto direto em R$, mas necessário para liberar o parecer',
        action: 'Executar novamente a análise financeira.'
      }
    ],
    actionPlan: [
      {
        priority: 'alta',
        action: 'Reexecutar a análise',
        reason: 'A chamada recebeu dados, porém a resposta estruturada não foi concluída',
        expectedImpact: 'Obter parecer consultivo completo',
        term: 'Imediato'
      },
      {
        priority: 'baixa',
        action: 'Revisar o payload recebido',
        reason: `Amostra do payload: ${payloadPreview || 'indisponível'}`,
        expectedImpact: 'Facilitar diagnóstico caso a falha persista',
        term: 'Após nova tentativa, se necessário'
      }
    ]
  };
}

function normalizeResponse(data: any, rawData: unknown): FinancialAnalysisResponse {
  if (!data || typeof data !== 'object') {
    return buildFallbackResponse(rawData, 'A resposta da IA veio vazia ou inválida.');
  }

  const normalized: FinancialAnalysisResponse = {
    summary: normalizeText(data.summary),
    score: {
      value:
        typeof data.score?.value === 'number' && Number.isFinite(data.score.value)
          ? Math.max(0, Math.min(100, Math.round(data.score.value)))
          : 50,
      label: normalizeText(data.score?.label, 'Atenção'),
      explanation: normalizeText(
        data.score?.explanation,
        'A IA não forneceu explicação detalhada do score.'
      )
    },
    kpis: Array.isArray(data.kpis)
      ? data.kpis.slice(0, 8).map((item: any) => ({
          label: normalizeText(item?.label),
          value: normalizeText(item?.value),
          status: normalizeStatus(item?.status),
          benchmark: normalizeText(item?.benchmark),
          description: normalizeText(item?.description),
          impact: normalizeText(item?.impact, 'Impacto financeiro não quantificado')
        }))
      : [],
    stability: {
      breakEven: normalizeText(data.stability?.breakEven),
      safetyMargin: normalizeText(data.stability?.safetyMargin),
      operatingRisk: normalizeText(data.stability?.operatingRisk),
      fixedCostPressure: normalizeText(data.stability?.fixedCostPressure),
      commentary: normalizeText(data.stability?.commentary)
    },
    profitability: {
      grossMargin: normalizeText(data.profitability?.grossMargin),
      contributionMargin: normalizeText(data.profitability?.contributionMargin),
      netMargin: normalizeText(data.profitability?.netMargin),
      cmv: normalizeText(data.profitability?.cmv),
      commentary: normalizeText(data.profitability?.commentary)
    },
    cashFlow: {
      currentPressure: normalizeText(data.cashFlow?.currentPressure),
      receivablesProfile: normalizeText(data.cashFlow?.receivablesProfile),
      payablesProfile: normalizeText(data.cashFlow?.payablesProfile),
      cashGenerationCapacity: normalizeText(data.cashFlow?.cashGenerationCapacity),
      commentary: normalizeText(data.cashFlow?.commentary)
    },
    alerts: Array.isArray(data.alerts)
      ? data.alerts.slice(0, 8).map((item: any) => ({
          title: normalizeText(item?.title),
          severity: normalizeSeverity(item?.severity),
          description: normalizeText(item?.description),
          financialImpact: normalizeText(
            item?.financialImpact,
            'Impacto financeiro não quantificado'
          ),
          action: normalizeText(item?.action)
        }))
      : [],
    opportunities: Array.isArray(data.opportunities)
      ? data.opportunities.slice(0, 8).map((item: any) => ({
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          financialImpact: normalizeText(
            item?.financialImpact,
            'Impacto financeiro não quantificado'
          ),
          action: normalizeText(item?.action)
        }))
      : [],
    recommendations: Array.isArray(data.recommendations)
      ? data.recommendations.slice(0, 8).map((item: any) => ({
          priority: normalizePriority(item?.priority),
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          financialImpact: normalizeText(
            item?.financialImpact,
            'Impacto financeiro não quantificado'
          ),
          action: normalizeText(item?.action)
        }))
      : [],
    actionPlan: Array.isArray(data.actionPlan)
      ? data.actionPlan.slice(0, 8).map((item: any) => ({
          priority: normalizePriority(item?.priority),
          action: normalizeText(item?.action),
          reason: normalizeText(item?.reason),
          expectedImpact: normalizeText(
            item?.expectedImpact,
            'Impacto financeiro não quantificado'
          ),
          term: normalizeText(item?.term)
        }))
      : []
  };

  if (!normalized.kpis.length) {
    normalized.kpis = buildFallbackResponse(rawData).kpis;
  }
  if (!normalized.alerts.length) {
    normalized.alerts = buildFallbackResponse(rawData).alerts;
  }
  if (!normalized.recommendations.length) {
    normalized.recommendations = buildFallbackResponse(rawData).recommendations;
  }
  if (!normalized.actionPlan.length) {
    normalized.actionPlan = buildFallbackResponse(rawData).actionPlan;
  }

  return normalized;
}

function extractPayload(body: any): unknown {
  if (!body || typeof body !== 'object') return body;

  if (body.financialData) return body.financialData;
  if (body.analysisData) return body.analysisData;
  if (body.data) return body.data;
  if (body.payload) return body.payload;

  return body;
}

function buildSystemPrompt(): string {
  return `
Você é a IA consultiva do Profit Food, especializada em análise financeira para restaurantes.

REGRAS OBRIGATÓRIAS:
1. Você NÃO calcula dados financeiros do zero.
2. Você NÃO altera números.
3. Você NÃO inventa indicadores ausentes.
4. Você APENAS interpreta os dados já calculados pelo motor financeiro do sistema.
5. O motor financeiro do Profit Food é a única fonte oficial dos números.
6. Sua função é transformar números já prontos em parecer consultivo profissional.
7. Siga o método Profit Food.
8. Sempre responda em português do Brasil.
9. Seja objetivo, consultivo, técnico e profissional.
10. Gere impacto financeiro em R$ sempre que isso estiver claramente sustentado pelos dados recebidos.
11. Quando não for possível quantificar com segurança, escreva explicitamente "Impacto financeiro não quantificado".
12. Nunca diga que está "estimando com precisão" algo que não foi fornecido.
13. Não devolva markdown. Não devolva texto fora do JSON.

DIRETRIZES DE INTERPRETAÇÃO:
- Analise DRE, margens, CMV, ponto de equilíbrio, margem de segurança, estrutura de custos, despesas e resultado.
- Priorize leitura gerencial e consultiva.
- Identifique gargalos operacionais, pressão de custos, fragilidade de margem e risco da estrutura.
- Traga alertas claros, práticos e acionáveis.
- Foque em gestão real de restaurante.
- O texto deve soar como parecer de consultor experiente.
- O score deve ser de 0 a 100 e representar a saúde financeira geral percebida a partir dos dados já calculados.
- O label do score deve ser algo como: "Crítico", "Atenção", "Estável", "Bom", "Muito bom".
- KPIs devem ser gerenciais, legíveis e úteis para dashboard.
- Em benchmark, use linguagem prática. Exemplo: "Ideal: CMV até 35%".
- Em status dos KPIs use somente: success, warning ou danger.
- Nas recomendações e plano de ação, priorize impacto operacional e financeiro.
`.trim();
}

function buildUserPrompt(financialData: unknown): string {
  return `
Analise os dados financeiros estruturados abaixo do Profit Food.

LEMBRE-SE:
- Não calcule do zero.
- Não altere os números.
- Apenas interprete os dados já processados pelo motor financeiro.
- Gere um JSON estritamente no schema solicitado.

DADOS:
${safeJsonStringify(financialData)}
`.trim();
}

function getResponseSchema() {
  return {
    name: 'profit_food_financial_analysis',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'score',
        'kpis',
        'stability',
        'profitability',
        'cashFlow',
        'alerts',
        'opportunities',
        'recommendations',
        'actionPlan'
      ],
      properties: {
        summary: {
          type: 'string'
        },
        score: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'label', 'explanation'],
          properties: {
            value: { type: 'number' },
            label: { type: 'string' },
            explanation: { type: 'string' }
          }
        },
        kpis: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'label',
              'value',
              'status',
              'benchmark',
              'description',
              'impact'
            ],
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
              status: {
                type: 'string',
                enum: ['success', 'warning', 'danger']
              },
              benchmark: { type: 'string' },
              description: { type: 'string' },
              impact: { type: 'string' }
            }
          }
        },
        stability: {
          type: 'object',
          additionalProperties: false,
          required: [
            'breakEven',
            'safetyMargin',
            'operatingRisk',
            'fixedCostPressure',
            'commentary'
          ],
          properties: {
            breakEven: { type: 'string' },
            safetyMargin: { type: 'string' },
            operatingRisk: { type: 'string' },
            fixedCostPressure: { type: 'string' },
            commentary: { type: 'string' }
          }
        },
        profitability: {
          type: 'object',
          additionalProperties: false,
          required: [
            'grossMargin',
            'contributionMargin',
            'netMargin',
            'cmv',
            'commentary'
          ],
          properties: {
            grossMargin: { type: 'string' },
            contributionMargin: { type: 'string' },
            netMargin: { type: 'string' },
            cmv: { type: 'string' },
            commentary: { type: 'string' }
          }
        },
        cashFlow: {
          type: 'object',
          additionalProperties: false,
          required: [
            'currentPressure',
            'receivablesProfile',
            'payablesProfile',
            'cashGenerationCapacity',
            'commentary'
          ],
          properties: {
            currentPressure: { type: 'string' },
            receivablesProfile: { type: 'string' },
            payablesProfile: { type: 'string' },
            cashGenerationCapacity: { type: 'string' },
            commentary: { type: 'string' }
          }
        },
        alerts: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'title',
              'severity',
              'description',
              'financialImpact',
              'action'
            ],
            properties: {
              title: { type: 'string' },
              severity: {
                type: 'string',
                enum: ['alta', 'media', 'baixa']
              },
              description: { type: 'string' },
              financialImpact: { type: 'string' },
              action: { type: 'string' }
            }
          }
        },
        opportunities: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'description', 'financialImpact', 'action'],
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              financialImpact: { type: 'string' },
              action: { type: 'string' }
            }
          }
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'priority',
              'title',
              'description',
              'financialImpact',
              'action'
            ],
            properties: {
              priority: {
                type: 'string',
                enum: ['alta', 'media', 'baixa']
              },
              title: { type: 'string' },
              description: { type: 'string' },
              financialImpact: { type: 'string' },
              action: { type: 'string' }
            }
          }
        },
        actionPlan: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['priority', 'action', 'reason', 'expectedImpact', 'term'],
            properties: {
              priority: {
                type: 'string',
                enum: ['alta', 'media', 'baixa']
              },
              action: { type: 'string' },
              reason: { type: 'string' },
              expectedImpact: { type: 'string' },
              term: { type: 'string' }
            }
          }
        }
      }
    }
  };
}

async function callOpenAI(financialData: unknown): Promise<FinancialAnalysisResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no ambiente.');
  }

  const requestBody = {
    model: OPENAI_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt()
      },
      {
        role: 'user',
        content: buildUserPrompt(financialData)
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: getResponseSchema()
    }
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${raw}`);
  }

  let parsedApiResponse: any;

  try {
    parsedApiResponse = JSON.parse(raw);
  } catch {
    throw new Error('A resposta da OpenAI não veio em JSON válido.');
  }

  const content = parsedApiResponse?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    return buildFallbackResponse(
      financialData,
      'A OpenAI respondeu sem conteúdo estruturado em choices[0].message.content.'
    );
  }

  let parsedContent: any;

  try {
    parsedContent = JSON.parse(stripCodeFences(content));
  } catch {
    return buildFallbackResponse(
      financialData,
      'A OpenAI respondeu, mas o conteúdo não pôde ser convertido para JSON.'
    );
  }

  return normalizeResponse(parsedContent, financialData);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const financialData = extractPayload(req.body);

    if (
      financialData === undefined ||
      financialData === null ||
      (typeof financialData === 'object' &&
        !Array.isArray(financialData) &&
        Object.keys(financialData as Record<string, unknown>).length === 0)
    ) {
      return res.status(400).json({
        error: 'Nenhum dado financeiro foi enviado para análise.'
      });
    }

    const analysis = await callOpenAI(financialData);

    return res.status(200).json(analysis);
  } catch (error: any) {
    console.error('Erro na análise financeira OpenAI:', error);

    return res.status(500).json({
      error: 'Falha ao gerar análise financeira com OpenAI.',
      details: error?.message || 'Erro desconhecido'
    });
  }
}
