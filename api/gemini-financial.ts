import { GoogleGenAI, Type } from "@google/genai";

type Status = "success" | "warning" | "danger";

function normalizeStatus(input: any): Status {
  const v = String(input || "").toLowerCase().trim();

  if (v === "success" || v === "warning" || v === "danger") return v;

  if (v.includes("ideal") || v.includes("seguro") || v.includes("ok") || v.includes("bom")) return "success";
  if (v.includes("aten") || v.includes("alert") || v.includes("moder")) return "warning";
  if (v.includes("crít") || v.includes("crit") || v.includes("perig") || v.includes("ruim")) return "danger";

  return "warning";
}

function ensureArrayOfStrings(x: any): string[] {
  if (Array.isArray(x)) return x.map((i) => String(i));
  return [];
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel env." });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing 'prompt' (string) in request body." });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: `
Você é o Assistente de Diagnóstico Financeiro ProfitFood.

REGRAS OBRIGATÓRIAS DE RETORNO:
- Retorne APENAS um JSON válido (sem markdown, sem texto extra).
- O campo "status" em cada KPI DEVE ser apenas: "success" ou "warning" ou "danger".
- O campo "safetyMarginStatus" DEVE ser apenas: "success" ou "warning" ou "danger".
- NÃO use palavras como "Ideal", "Atenção", "Crítico", "Seguro". Converta para:
  - Ideal / Seguro => "success"
  - Atenção => "warning"
  - Crítico => "danger"
- Inclua SEMPRE: summary, kpis, stability, criticalAlerts, recommendations, healthScore.
- healthScore: número de 0 a 100.
- Use os benchmarks ProfitFood rigorosamente.
        `.trim(),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            kpis: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ["success", "warning", "danger"] },
                  benchmark: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["label", "value", "status", "benchmark", "description"],
              },
            },
            stability: {
              type: Type.OBJECT,
              properties: {
                breakEven: { type: Type.STRING },
                safetyMargin: { type: Type.STRING },
                safetyMarginStatus: { type: Type.STRING, enum: ["success", "warning", "danger"] },
              },
              required: ["breakEven", "safetyMargin", "safetyMarginStatus"],
            },
            criticalAlerts: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            healthScore: { type: Type.NUMBER },
          },
          required: ["summary", "kpis", "stability", "criticalAlerts", "recommendations", "healthScore"],
        },
      },
    });

    const text = response?.text ?? "";
    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Model did not return valid JSON.", raw: text });
    }

    if (Array.isArray(data?.kpis)) {
      data.kpis = data.kpis.map((k: any) => ({
        ...k,
        status: normalizeStatus(k?.status),
      }));
    } else {
      data.kpis = [];
    }

    if (data?.stability) {
      data.stability = {
        ...data.stability,
        safetyMarginStatus: normalizeStatus(data?.stability?.safetyMarginStatus),
      };
    } else {
      data.stability = {
        breakEven: "",
        safetyMargin: "",
        safetyMarginStatus: "warning" as Status,
      };
    }

    data.criticalAlerts = ensureArrayOfStrings(data?.criticalAlerts);
    data.recommendations = ensureArrayOfStrings(data?.recommendations);

    if (typeof data?.healthScore !== "number" || Number.isNaN(data.healthScore)) {
      data.healthScore = 0;
    } else {
      data.healthScore = Math.max(0, Math.min(100, data.healthScore));
    }

    if (typeof data?.summary !== "string") data.summary = "";

    return res.status(200).json(data);
  } catch (err: any) {
    const message = err?.message || "Unknown error";

    if (String(message).includes("429") || String(message).includes("RESOURCE_EXHAUSTED")) {
      return res.status(429).json({
        error: "Rate limit/quota exceeded. Try again in a few seconds.",
        details: message,
      });
    }

    return res.status(500).json({ error: "Gemini request failed.", details: message });
  }
}
