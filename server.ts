import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim().length > 0 && apiKey !== 'MY_GEMINI_API_KEY');
}

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please add your key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 60000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const FREE_TIER_MODEL = 'gemini-3.1-flash-lite';

async function generateFreeTierContent(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
) {
  return await ai.models.generateContent({
    model: FREE_TIER_MODEL,
    ...params,
    config: {
      ...params.config,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });
}

function extractApiErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : 'Erreur serveur inattendue.';
  if (raw.includes('GEMINI_API_KEY')) {
    return { status: 503, message: raw };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403') || raw.includes('400')) {
    console.warn('[AFRIKA AI] Invalid or unauthorized Gemini API key.');
    return {
      status: 400,
      message: 'La clé API Gemini est invalide ou non autorisée. Vérifiez-la dans Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429') || raw.includes('quota')) {
    console.warn('[AFRIKA AI] Gemini free tier quota reached (429).');
    return {
      status: 429,
      message:
        'Le quota gratuit Gemini est temporairement épuisé. Patientez quelques minutes puis réessayez.',
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    console.warn('[AFRIKA AI] Upstream Gemini 503 high demand.');
    return {
      status: 503,
      message: 'Le service IA est temporairement saturé. Réessayez dans quelques instants.',
    };
  }
  if (raw.includes('AbortError') || raw.includes('ETIMEDOUT') || raw.includes('timeout')) {
    console.warn('[AFRIKA AI] Upstream Gemini request timeout.');
    return {
      status: 504,
      message: 'La requête a pris trop de temps. Réessayez avec une image plus nette ou un réseau stable.',
    };
  }
  console.error('[AFRIKA AI] Unexpected server error:', err);
  return { status: 500, message: raw };
}

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_HISTORY_TURN_CHARS = 400;

function buildSystemInstruction(focus: string, hasImage = false): string {
  const visionGuidance = hasImage
    ? ' Image jointe : lis le texte ou l’exercice visible et réponds brièvement ; signale si une zone est illisible sans inventer.'
    : '';

  if (focus === 'Étudiant') {
    return `AFRIKA AI (Mode Étudiant). Réponds en français simple et très court (max 4 à 5 étapes brèves, sans introduction ni blabla) avec un exemple africain si utile.${visionGuidance}`;
  }

  if (focus === 'Entrepreneur') {
    return `AFRIKA AI (Mode Entrepreneur). Réponse courte et directe (4 à 5 points max, montants en FCFA, sans texte inutile).${visionGuidance}`;
  }

  return `AFRIKA AI (focus: ${focus}). Reply in the user's language in 3 to 5 very concise lines, no filler.${visionGuidance}`;
}

function normalizeHistory(history: ChatTurn[]): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  const cleaned = history
    .filter(
      (item): item is ChatTurn =>
        Boolean(item) &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0,
    )
    .slice(-6);

  const normalized: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const turn of cleaned) {
    const role = turn.role === 'assistant' ? 'model' : 'user';
    const snippet = turn.text.trim().slice(0, MAX_HISTORY_TURN_CHARS);
    const last = normalized[normalized.length - 1];
    if (last && last.role === role) {
      last.parts[0].text = `${last.parts[0].text}\n${snippet}`;
    } else {
      normalized.push({ role, parts: [{ text: snippet }] });
    }
  }

  if (normalized.length > 0 && normalized[0].role === 'model') {
    normalized.shift();
  }
  if (normalized.length > 0 && normalized[normalized.length - 1].role === 'user') {
    // Drop trailing unpaired user turn if a previous call failed before assistant replied
    normalized.pop();
  }

  return normalized;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'afrika-ai',
      version: '2.0',
      geminiConfigured: isGeminiConfigured(),
      model: FREE_TIER_MODEL,
    });
  });

  app.get('/api/models', async (_req, res) => {
    try {
      const ai = getAiClient();
      const pager = await ai.models.list({ config: { pageSize: 50 } });
      const availableModels: string[] = [];
      for await (const model of pager) {
        if (model.name) {
          availableModels.push(model.name.replace(/^models\//, ''));
        }
        if (availableModels.length >= 50) break;
      }
      res.json({
        model: FREE_TIER_MODEL,
        availableModels,
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/ask', async (req, res) => {
    res.setTimeout(70000);
    try {
      const { message = '', history = [], focus = 'General', image } = req.body as {
        message?: string;
        history?: ChatTurn[];
        focus?: string;
        image?: { mimeType?: string; data?: string };
      };

      const trimmed = typeof message === 'string' ? message.trim().slice(0, 1500) : '';
      const hasImagePayload = Boolean(image && (image.data || image.mimeType));

      if (!trimmed && !hasImagePayload) {
        res.status(400).json({ error: 'Veuillez saisir une question ou joindre une image.' });
        return;
      }

      const userParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (hasImagePayload) {
        const mimeType = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase().trim() : '';
        if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
          res.status(400).json({
            error: 'Format d’image non pris en charge. Utilisez JPG, PNG ou WEBP.',
          });
          return;
        }

        const rawData = typeof image?.data === 'string' ? image.data.trim() : '';
        const cleanBase64 = rawData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        if (!cleanBase64 || !/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
          res.status(400).json({ error: 'Les données de l’image sont invalides.' });
          return;
        }

        const byteLength = Buffer.byteLength(cleanBase64, 'base64');
        if (byteLength === 0 || byteLength > MAX_IMAGE_BYTES) {
          res.status(400).json({
            error: 'L’image dépasse la limite maximale autorisée de 5 Mo.',
          });
          return;
        }

        userParts.push({
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        });
      }

      const effectivePrompt =
        trimmed ||
        (focus === 'Étudiant'
          ? 'Analyse cette image. Explique brièvement étape par étape en français simple.'
          : 'Décris et explique brièvement cette image.');

      userParts.push({ text: effectivePrompt });

      const safeHistory = Array.isArray(history) ? normalizeHistory(history) : [];
      const ai = getAiClient();

      const contents = [
        ...safeHistory,
        {
          role: 'user' as const,
          parts: userParts,
        },
      ];

      const response = await generateFreeTierContent(ai, {
        contents,
        config: {
          systemInstruction: buildSystemInstruction(focus, hasImagePayload),
        },
      });

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'Aucune réponse générée. Veuillez réessayer.' });
        return;
      }

      res.json({ reply });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/translate', async (req, res) => {
    try {
      const { text, sourceLang, targetLang } = req.body as {
        text?: string;
        sourceLang?: string;
        targetLang?: string;
      };

      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Veuillez saisir un texte à traduire.' });
        return;
      }
      if (!sourceLang || !targetLang) {
        res.status(400).json({ error: 'Les langues source et cible sont requises.' });
        return;
      }

      const trimmedText = text.trim().slice(0, 400);
      if (sourceLang === targetLang) {
        res.json({
          translation: trimmedText,
          phonetic: trimmedText,
          culturalNote: 'Les langues source et cible sont identiques.',
          exampleSentence: trimmedText,
          exampleMeaning: trimmedText,
          confidence: 'high',
          uncertaintyNote: '',
        });
        return;
      }

      const involvesBambara = sourceLang === 'Bambara' || targetLang === 'Bambara';
      const ai = getAiClient();

      const prompt = `Translate ${sourceLang} -> ${targetLang}. Keep every field very concise (1 short sentence max).
${
  involvesBambara
    ? 'BAMBARA: use readable Latin orthography (ɛ, ɔ, ɲ, ŋ). If uncertain or dialectal, set confidence="medium" or "uncertain" and write a short French uncertaintyNote advising native speaker check.'
    : 'Set confidence="high" unless ambiguous.'
}
Text: "${trimmedText}"`;

      const response = await generateFreeTierContent(ai, {
        contents: prompt,
        config: {
          systemInstruction:
            'African linguist & French/English/Bambara translator. Concise output, honest on Bambara uncertainty.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translation: { type: Type.STRING },
              phonetic: { type: Type.STRING },
              culturalNote: { type: Type.STRING },
              exampleSentence: { type: Type.STRING },
              exampleMeaning: { type: Type.STRING },
              confidence: {
                type: Type.STRING,
                description: 'high, medium, or uncertain',
              },
              uncertaintyNote: {
                type: Type.STRING,
                description: 'Empty if high confidence, otherwise 1 brief note.',
              },
            },
            required: [
              'translation',
              'phonetic',
              'culturalNote',
              'exampleSentence',
              'exampleMeaning',
              'confidence',
              'uncertaintyNote',
            ],
          },
        },
      });

      const raw = response.text?.trim();
      if (!raw) {
        res.status(502).json({ error: 'Translation returned empty output.' });
        return;
      }

      const parsed = JSON.parse(raw) as {
        translation: string;
        phonetic: string;
        culturalNote: string;
        exampleSentence: string;
        exampleMeaning: string;
        confidence: string;
        uncertaintyNote: string;
      };

      res.json(parsed);
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/explore', async (req, res) => {
    try {
      const { title, region, question } = req.body as {
        title?: string;
        region?: string;
        question?: string;
      };

      if (!title || !region) {
        res.status(400).json({ error: 'Topic title and region are required.' });
        return;
      }

      const ai = getAiClient();
      const prompt = question?.trim()
        ? `"${title}" (${region}): ${question.trim().slice(0, 240)}`
        : `3 ultra-short bullets on "${title}" (${region}): cultural role, place, 1 local term.`;

      const response = await generateFreeTierContent(ai, {
        contents: prompt,
        config: {
          systemInstruction: 'AFRIKA AI. Max 3 very brief lines.',
        },
      });

      res.json({ insight: response.text?.trim() || 'No insight available right now.' });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Never let unmatched /api/* requests fall through to HTML SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route API introuvable.' });
  });

  // Ensure JSON parse errors or middleware errors under /api return JSON, never HTML
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
      return;
    }
    next(err);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AFRIKA AI server running on http://0.0.0.0:${PORT}`);
  });
  server.requestTimeout = 75000;
  server.headersTimeout = 76000;
  server.keepAliveTimeout = 65000;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
