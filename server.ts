import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { OpenAI } from "openai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // API routes
  app.post("/api/analyze", async (req, res) => {
    const { prompt, systemInstruction, responseSchema } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY não configurada no servidor." });
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Custo eficiente e boa qualidade
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        response_format: responseSchema ? { type: "json_object" } : undefined,
      });

      const content = response.choices[0].message.content;
      if (responseSchema) {
        try {
          return res.json(JSON.parse(content || "{}"));
        } catch (e) {
          console.error("Erro ao parsear JSON da OpenAI:", e);
          return res.status(500).json({ error: "Erro ao processar a resposta da IA." });
        }
      }

      res.json({ text: content });
    } catch (error) {
      console.error("Erro na OpenAI API:", error);
      res.status(500).json({ error: "Não foi possível gerar a análise no momento. Tente novamente em instantes." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
