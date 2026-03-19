import type { VercelRequest, VercelResponse } from '@vercel/node';

type KPIStatus = 'success' | 'warning' | 'danger';

interface FinancialAnalysisData {
  summary: string;
  scoreExplanation: string;
  whatIfNothingIsDone: string;
  recoveryOpportunity: string;
  kpis: {
    label: string;
    value: string;
    status: KPIStatus;
    benchmark: string;
    description: string;
  }[];
  stability: {
    breakEven: string;
    safetyMargin: string;
    safetyMarginStatus: KPIStatus;
  };
  criticalAlerts: string[];
  recommendations: string[];
  healthScore: number;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizeStatus(value: unknown, fallback: KPIStatus = 'warning'): KPIStatus {
  if (value === 'success' || value === 'warning' || value === 'danger') return value;
  return fallback;
}

function clampScore(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }
  return 50;
}

function buildSimpleSystemInstruction(userInstruction?: string): string {
  return `
Você é o Assistente de Diagnóstico Financeiro Profit Food.

REGRAS:
- Responda em português do Brasil.
- Seja consultivo, claro, direto e profissional.
- Gere uma resposta curta e útil.
- Não use markdown.
- Retorne apenas texto puro.
${userInstruction ? `- Instrução adicional do sistema do app: ${userInstruction}` : ''}
`.trim();
}

function buildDetailedSystemInstruction(userInstruction?: string): string {
  return `
Você é o Assistente de Diagnóstico Financeiro Profit Food.

REGRAS ABSOLUTAS:
1. Responda em português do Brasil.
2. Retorne APENAS JSON válido.
3. Não escreva texto fora do JSON.
4. Respeite exatamente a estrutura solicitada.
5. Use rigorosamente os benchmarks Profit Food fornecidos no prompt do usuário.
6. Traduza desvios em impacto financeiro estimado em R$ sempre que possível.
7. Use linguagem consultiva, executiva, clara e profissional.
8. Não altere a estrutura dos campos.
9. Use apenas status: success, warning ou danger.
10. criticalAlerts deve ser array de strings.
11. recommendations deve ser array de strings.
12. healthScore deve ser número entre 0 e 100.
${userInstruction ? `13. Instrução adicional do sistema do app: ${userInstruction}` : ''}
`.trim();
}

function buildDetailedSchema() {
  return {
    name: 'profit_food_detailed_financial_analysis',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'scoreExplanation',
        'whatIfNothingIsDone',
        'recoveryOpportunity',
        'kpis',
        'stability',
        'criticalAlerts',
        'recommendations',
        'healthScore'
      ],
      properties: {
        summary: { type: 'string' },
        scoreExplanation: { type: 'string' },
        whatIfNothingIsDone: { type: 'string' },
        recoveryOpportunity: { type: 'string' },
        kpis: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'value', 'status', 'benchmark', 'description'],
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
              status: {
                type: 'string',
                enum: ['success', 'warning', 'danger']
              },
              benchmark: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        stability: {
          type: 'object',
          additionalProperties: false,
          required: ['breakEven', 'safetyMargin', 'safetyMarginStatus'],
          properties: {
            breakEven: { type: 'string' },
            safetyMargin: { type: 'string' },
            safetyMarginStatus: {
              type: 'string',
              enum: ['success', 'warning', 'danger']
            }
          }
        },
        criticalAlerts: {
          type: 'array',
          items: { type: 'string' }
        },
        recommendations: {
          type: 'array',
          items: { type: 'string' }
        },
        healthScore: { type: 'number' }
      }
    }
  };
}

function buildFallbackDetailedResponse(prompt?: string): FinancialAnalysisData {
  const promptText = typeof prompt === 'string' ? prompt : '';
  const hasPeriod = promptText.match(/para\s+(.+?)\./i);
  const detectedPeriod = hasPeriod?.[1]?.trim() || 'o período analisado';

  return {
    summary: `Os dados de ${detectedPeriod} foram recebidos, mas a IA não conseguiu consolidar o parecer completo nesta tentativa. O ideal é repetir a análise para obter a leitura consultiva completa com impacto financeiro e plano de ação.`,
    scoreExplanation:
      'O score geral posiciona o negócio em zona de atenção, com sinais de desequilíbrio que exigem ação corretiva.',
    whatIfNothingIsDone:
      'Se nada for feito, os desvios operacionais e financeiros podem continuar pressionando margem, lucro e geração de caixa, reduzindo a capacidade de reação da operação ao longo dos próximos meses.',
    recoveryOpportunity:
      'Com a correção dos principais desvios identificados, existe potencial de recuperação financeira, mas a quantificação estimada não pôde ser consolidada nesta tentativa automática.',
    kpis: [
      {
        label: 'Status da análise',
        value: 'Parcial',
        status: 'warning',
        benchmark: 'Esperado: parecer completo',
        description:
          'A estrutura técnica da análise foi acionada, mas a resposta completa da IA não pôde ser normalizada nesta tentativa.'
      }
    ],
    stability: {
      breakEven: 'Não informado',
      safetyMargin: 'Não informado',
      safetyMarginStatus: 'warning'
    },
    criticalAlerts: [
      'A análise consultiva não foi concluída integralmente nesta tentativa. Reexecute para obter o parecer completo.'
    ],
    recommendations: [
      'Reprocessar a análise para consolidar os indicadores consultivos e o plano de ação com base no método Profit Food.'
    ],
    healthScore: 50
  };
}

function normalizeDetailedResponse(data: any, prompt?: string): FinancialAnalysisData {
  const fallback = buildFallbackDetailedResponse(prompt);

  if (!data || typeof data !== 'object') {
    return fallback;
  }

  return {
    summary: normalizeText(data.summary, fallback.summary),
    scoreExplanation: normalizeText(data.scoreExplanation, fallback.scoreExplanation),
    whatIfNothingIsDone: normalizeText(
      data.whatIfNothingIsDone,
      fallback.whatIfNothingIsDone
    ),
    recoveryOpportunity: normalizeText(
      data.recoveryOpportunity,
      fallback.recoveryOpportunity
    ),
    kpis: Array.isArray(data.kpis) && data.kpis.length > 0
      ? data.kpis.slice(0, 8).map((item: any) => ({
          label: normalizeText(item?.label),
          value: normalizeText(item?.value),
          status: normalizeStatus(item?.status),
          benchmark: normalizeText(item?.benchmark),
          description: normalizeText(item?.description)
        }))
      : fallback.kpis,
    stability: {
      breakEven: normalizeText(data.stability?.breakEven, fallback.stability.breakEven),
      safetyMargin: normalizeText(
        data.stability?.safetyMargin,
        fallback.stability.safetyMargin
      ),
      safetyMarginStatus: normalizeStatus(
        data.stability?.safetyMarginStatus,
        fallback.stability.safetyMarginStatus
      )
    },
    criticalAlerts:
      Array.isArray(data.criticalAlerts) && data.criticalAlerts.length > 0
        ? data.criticalAlerts.slice(0, 8).map((item: any) => normalizeText(item))
        : fallback.criticalAlerts,
    recommendations:
      Array.isArray(data.recommendations) && data.recommendations.length > 0
        ? data.recommendations.slice(0, 8).map((item: any) => normalizeText(item))
        : fallback.recommendations,
    healthScore: clampScore(data.healthScore)
  };
}

async function callOpenAIForText(prompt: string, systemInstruction?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no ambiente.');
  }

  const requestBody = {
    model: OPENAI_MODEL,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: buildSimpleSystemInstruction(systemInstruction)
      },
      {
        role: 'user',
        content: prompt
      }
    ]
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

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('A resposta da OpenAI não veio em JSON válido.');
  }

  const content = parsed?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    return 'Não foi possível gerar a análise no momento.';
  }

  return content.trim();
}

async function callOpenAIForDetailedJson(
  prompt: string,
  systemInstruction?: string
): Promise<FinancialAnalysisData> {
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
        content: buildDetailedSystemInstruction(systemInstruction)
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: buildDetailedSchema()
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

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('A resposta da OpenAI não veio em JSON válido.');
  }

  const content = parsed?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    return buildFallbackDetailedResponse(prompt);
  }

  try {
    const json = JSON.parse(stripCodeFences(content));
    return normalizeDetailedResponse(json, prompt);
  } catch {
    return buildFallbackDetailedResponse(prompt);
  }
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
    const { prompt, systemInstruction, responseSchema } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        error: 'Prompt não informado.'
      });
    }

    if (responseSchema) {
      const analysis = await callOpenAIForDetailedJson(prompt, systemInstruction);
      return res.status(200).json(analysis);
    }

    const text = await callOpenAIForText(prompt, systemInstruction);
    return res.status(200).json({ text });
  } catch (error: any) {
    console.error('Erro na análise financeira OpenAI:', error);

    return res.status(500).json({
      error: 'Falha ao gerar análise financeira com OpenAI.',
      details: error?.message || 'Erro desconhecido'
    });
  }
}
