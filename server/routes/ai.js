import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getOpenAIClient } from "../ai/openai.js";

const router = express.Router();
router.use(requireAuth);

/**
 * IMPORTANTE (salud):
 * - Esto NO es diagnóstico.
 * - Solo clasifica y sugiere.
 * - En producción: agrega disclaimers, logging, control de acceso y filtros.
 */
router.post("/triage", async (req, res) => {
  const { message } = req.body || {};
  if (!message || String(message).trim().length < 8) return res.status(400).json({ error: "message_too_short" });

  const client = getOpenAIClient();
  if (!client) {
    return res.json({
      reply:
        "IA no configurada. Agrega OPENAI_API_KEY en server/.env. Mientras tanto: describe síntomas, tiempo de evolución y si hay fiebre/dolor intenso."
    });
  }

  const input = [
    {
      role: "system",
      content:
        "Eres un asistente de triage para una clínica. NO diagnostiques. Clasifica urgencia (baja/media/alta), sugiere especialidad y sugiere preguntas de aclaración. Responde en español, breve y estructurado."
    },
    { role: "user", content: `Mensaje del paciente: ${message}` }
  ];

  const r = await client.responses.create({
    model: "gpt-5.2",
    input
  });

  res.json({ reply: r.output_text });
});

router.post("/summary", async (req, res) => {
  const { notes } = req.body || {};
  if (!notes || String(notes).trim().length < 20) return res.status(400).json({ error: "notes_too_short" });

  const client = getOpenAIClient();
  if (!client) return res.json({ reply: "IA no configurada (OPENAI_API_KEY)." });

  const input = [
    {
      role: "system",
      content:
        "Eres un asistente clínico que resume texto en formato SOAP (Subjetivo, Objetivo, Evaluación, Plan). No inventes datos. Responde en español."
    },
    { role: "user", content: notes }
  ];

  const r = await client.responses.create({
    model: "gpt-5.2",
    input
  });

  res.json({ reply: r.output_text });
});

export default router;
