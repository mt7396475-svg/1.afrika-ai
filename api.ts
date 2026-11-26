const DEFAULT_TIMEOUT_MS = 20000;
export const IMAGE_REQUEST_TIMEOUT_MS = 60000;
const WARMUP_RETRY_DELAY_MS = 1000;

export interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJson<T>(url: string, options?: RequestJsonOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _ignored, ...fetchOptions } = options ?? {};

  // Allow at most 1 short retry only when Cloud Run serves its "Starting Server..." page
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...fetchOptions.headers,
        },
      });
    } catch (networkErr) {
      clearTimeout(timeoutId);
      if (networkErr instanceof DOMException && networkErr.name === 'AbortError') {
        const seconds = Math.round(timeoutMs / 1000);
        throw new Error(
          `La connexion mobile est trop lente (${seconds} s dépassées). Vérifiez votre réseau et appuyez sur Réessayer.`,
        );
      }
      throw new Error(
        'Connexion impossible au serveur AFRIKA AI. Vérifiez votre réseau et appuyez sur Réessayer.',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const trimmed = rawText.trimStart();

    const looksLikeHtml =
      contentType.includes('text/html') ||
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html');

    if (looksLikeHtml) {
      const isStartingServer = trimmed.includes('Starting Server');
      if (isStartingServer && attempt === 0) {
        await sleep(WARMUP_RETRY_DELAY_MS);
        continue;
      }
      if (isStartingServer) {
        throw new Error(
          'Le serveur AFRIKA AI termine son démarrage. Patientez un instant puis appuyez sur Réessayer.',
        );
      }
      throw new Error(
        `Le serveur a renvoyé une page HTML (HTTP ${response.status}) au lieu d’une réponse JSON pour ${url}.`,
      );
    }

    const isJsonContentType = contentType.includes('application/json');
    const looksLikeJsonBody = trimmed.startsWith('{') || trimmed.startsWith('[');

    if (!isJsonContentType && !looksLikeJsonBody) {
      throw new Error(
        `Réponse serveur invalide (HTTP ${response.status}, format "${contentType || 'inconnu'}").`,
      );
    }

    let data: unknown;
    try {
      data = trimmed ? JSON.parse(trimmed) : {};
    } catch {
      throw new Error(
        `La réponse du serveur n’est pas un JSON valide (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      const errPayload = data as { error?: string; message?: string };
      throw new Error(
        errPayload?.error ||
          errPayload?.message ||
          `Erreur serveur HTTP ${response.status} lors de l’appel à ${url}.`,
      );
    }

    return data as T;
  }

  throw new Error('Le serveur AFRIKA AI n’a pas encore répondu. Appuyez sur Réessayer.');
}

export function postJson<T>(
  url: string,
  body: unknown,
  options?: { timeoutMs?: number },
): Promise<T> {
  return requestJson<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: options?.timeoutMs,
  });
}
