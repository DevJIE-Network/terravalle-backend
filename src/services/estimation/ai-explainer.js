/**
 * HU-009 · Explicación con IA (opcional).
 *
 * Si se configura ESTIMATION_AI_API_KEY, un modelo de lenguaje (API de Anthropic) redacta la
 * explicación del resultado. La IA NO calcula ni modifica las cifras: solo explica los factores
 * que ya calculó el modelo de valuación. Si no hay llave, la llamada falla o tarda demasiado,
 * se devuelve null y se usa la explicación local.
 *
 * Solo se envían datos del inmueble (tipo, municipio, estado, cifras y factores); nunca datos
 * personales del vendedor.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_LENGTH = 1500;

const SYSTEM_PROMPT =
  'Eres el asistente de valuación de TerraValle, una plataforma de bienes raíces en México. ' +
  'Recibirás un resultado de estimación ya calculado. Redacta en español, en un solo párrafo de ' +
  '3 a 5 oraciones, por qué se obtuvo ese valor, mencionando los factores más relevantes. ' +
  'No cambies ni inventes cifras, no prometas precios de venta y aclara que es una estimación ' +
  'orientativa que no sustituye un avalúo profesional. Responde solo con el párrafo.';

function getConfig(env = process.env) {
  const apiKey = env.ESTIMATION_AI_API_KEY?.trim();
  if (!apiKey) return null;
  const timeout = Number(env.ESTIMATION_AI_TIMEOUT_MS);
  return {
    apiKey,
    model: env.ESTIMATION_AI_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * @returns {Promise<{ text: string, model: string } | null>}
 */
async function explainWithAi(summary, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = getConfig(env);
  if (!config || typeof fetchImpl !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(summary) }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.content?.find?.((block) => block.type === 'text')?.text?.trim();
    if (!text) return null;

    return { text: text.slice(0, MAX_LENGTH), model: config.model };
  } catch {
    // Sin conexión, tiempo agotado o respuesta inválida: se usa la explicación local.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { explainWithAi, getConfig, DEFAULT_MODEL };
