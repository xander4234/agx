import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getOpenAIClient } from "../ai/openai.js";
import { ah } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * IMPORTANTE (salud):
 * - Esto NO es diagnóstico. Solo clasifica y sugiere.
 */
router.post("/triage", ah(async (req, res) => {
  const message = String(req.body?.message ?? "").trim().slice(0, 4000);
  if (message.length < 8) return res.status(400).json({ error: "message_too_short" });

  const client = getOpenAIClient();
  if (!client) {
    return res.json({
      reply:
        "IA no configurada. Agrega OPENAI_API_KEY en server/.env. Mientras tanto: describe síntomas, tiempo de evolución y si hay fiebre/dolor intenso."
    });
  }

  const r = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente de triage para una clínica. NO diagnostiques. Clasifica urgencia (baja/media/alta), sugiere especialidad y sugiere preguntas de aclaración. Termina siempre indicando que esto no reemplaza una evaluación médica. Responde en español, breve y estructurado."
      },
      { role: "user", content: `Mensaje del paciente: ${message}` }
    ]
  });

  res.json({ reply: r.choices[0]?.message?.content ?? "" });
}));

router.post("/summary", ah(async (req, res) => {
  const notes = String(req.body?.notes ?? "").trim().slice(0, 8000);
  if (notes.length < 20) return res.status(400).json({ error: "notes_too_short" });

  const client = getOpenAIClient();
  if (!client) return res.json({ reply: "IA no configurada (OPENAI_API_KEY)." });

  const r = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente clínico que resume texto en formato SOAP (Subjetivo, Objetivo, Evaluación, Plan). No inventes datos. Responde en español."
      },
      { role: "user", content: notes }
    ]
  });

  res.json({ reply: r.choices[0]?.message?.content ?? "" });
}));

export default router;
