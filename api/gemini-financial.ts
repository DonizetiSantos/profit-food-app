import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
        systemInstruction:
          "Você é o Assistente de Diagnóstico Financeiro ProfitFood. Retorne APENAS um JSON válido. Use os benchmarks ProfitFood.",
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
                  status: { type: Type.STRING },
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
                safetyMarginStatus: { type: Type.STRING },
              },
              required: ["breakEven", "safetyMargin", "safetyMarginStatus"],
            },
          },
          required: ["summary", "kpis", "stability"],
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
