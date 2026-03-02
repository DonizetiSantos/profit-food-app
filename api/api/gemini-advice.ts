import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

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
          "Você é o Assistente de Diagnóstico Financeiro ProfitFood. Sua linguagem deve ser consultiva, provocativa e clara. Foque em eficiência operacional e gestão de margens.",
      },
    });

    return res.status(200).json({ text: response.text || "" });
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
