export interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: {
        transcript: string;
      };
    };
  };
}

export interface BrowserSpeechRecognitionErrorEvent {
  error: string;
}

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakText(
  text: string,
  langLocale = 'fr-FR',
  onEnd?: () => void,
): boolean {
  if (!isSpeechSynthesisSupported() || !text.trim()) return false;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langLocale;
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const baseLang = langLocale.split('-')[0].toLowerCase();
  const preferredVoice =
    voices.find((v) => v.lang.toLowerCase() === langLocale.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(baseLang));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function mapSpeechRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Accès au microphone refusé. Autorisez le micro dans les paramètres de votre navigateur Android/desktop (icône cadenas ou Paramètres du site).';
    case 'no-speech':
      return 'Aucune voix détectée. Rapprochez-vous du micro et réessayez.';
    case 'audio-capture':
      return 'Aucun microphone détecté sur cet appareil.';
    case 'network':
      return 'La reconnaissance vocale nécessite une connexion Internet active.';
    default:
      return 'Dictée vocale interrompue. Vous pouvez continuer au clavier.';
  }
}
