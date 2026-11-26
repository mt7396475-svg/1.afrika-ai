import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Copy,
  Languages,
  Mic,
  MicOff,
  Volume2,
} from 'lucide-react';
import { ESSENTIAL_PHRASES, SUPPORTED_LANGUAGES } from '../data/afrikaContent';
import {
  BrowserSpeechRecognition,
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  mapSpeechRecognitionError,
  speakText,
} from '../utils/voice';
import { postJson } from '../utils/api';

interface TranslationResult {
  translation: string;
  phonetic: string;
  culturalNote: string;
  exampleSentence: string;
  exampleMeaning: string;
  confidence: 'high' | 'medium' | 'uncertain' | string;
  uncertaintyNote: string;
}

interface TranslateViewProps {
  onNotify: (msg: string) => void;
}

const PHRASE_CATEGORIES = ['All', 'Bambara', 'Greetings', 'Hospitality', 'Market', 'Travel'] as const;

const QUICK_PAIRS = [
  { label: 'Français ↔ English', from: 'French', to: 'English' },
  { label: 'Français → Bambara', from: 'French', to: 'Bambara' },
  { label: 'Bambara → Français', from: 'Bambara', to: 'French' },
  { label: 'English → Swahili', from: 'English', to: 'Swahili' },
];

export function TranslateView({ onNotify }: TranslateViewProps) {
  const [sourceLang, setSourceLang] = useState('French');
  const [targetLang, setTargetLang] = useState('English');
  const [sourceText, setSourceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [phraseCategory, setPhraseCategory] = useState<(typeof PHRASE_CATEGORIES)[number]>('All');
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const inFlightRef = useRef(false);
  const translationCacheRef = useRef<Map<string, TranslationResult>>(new Map());

  const micSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  const filteredPhrases = useMemo(() => {
    if (phraseCategory === 'All') return ESSENTIAL_PHRASES;
    if (phraseCategory === 'Bambara') {
      return ESSENTIAL_PHRASES.filter((p) => p.language === 'Bambara');
    }
    return ESSENTIAL_PHRASES.filter((p) => p.category === phraseCategory);
  }, [phraseCategory]);

  function handleSwap() {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    if (result?.translation) {
      setSourceText(result.translation);
      setResult(null);
    }
  }

  function handleMic() {
    setVoiceError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceError('Dictée vocale non supportée par ce navigateur.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    try {
      const recognition = new Ctor();
      const match = SUPPORTED_LANGUAGES.find((l) => l.name === sourceLang);
      recognition.lang = match?.speechLocale ?? 'fr-FR';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i += 1) {
          transcript += event.results[i][0].transcript;
        }
        setSourceText(transcript.trim());
      };
      recognition.onerror = (event) => {
        setVoiceError(mapSpeechRecognitionError(event.error));
        setListening(false);
      };
      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setVoiceError('Impossible d’ouvrir le microphone.');
      setListening(false);
    }
  }

  async function handleTranslate(e: FormEvent) {
    e.preventDefault();
    const trimmed = sourceText.trim();
    if (!trimmed || inFlightRef.current || loading) return;

    if (sourceLang === targetLang) {
      setError(null);
      setResult({
        translation: trimmed,
        phonetic: trimmed,
        culturalNote: 'Les langues source et cible sont identiques.',
        exampleSentence: trimmed,
        exampleMeaning: trimmed,
        confidence: 'high',
        uncertaintyNote: '',
      });
      return;
    }

    const cacheKey = `${sourceLang}::${targetLang}::${trimmed.toLowerCase()}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setError(null);
      setResult(cached);
      return;
    }

    inFlightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const data = await postJson<TranslationResult>('/api/translate', {
        text: trimmed,
        sourceLang,
        targetLang,
      });
      if (!data.translation) {
        throw new Error('La traduction retournée est vide.');
      }

      translationCacheRef.current.set(cacheKey, data);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la traduction.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  function handleSpeak(text: string, langName: string) {
    if (!ttsSupported) {
      onNotify('Lecture vocale indisponible dans ce navigateur');
      return;
    }
    const match = SUPPORTED_LANGUAGES.find((l) => l.name === langName);
    speakText(text, match?.speechLocale ?? 'fr-FR');
  }

  async function handleCopy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      onNotify('Copié dans le presse-papiers');
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1600);
    } catch {
      onNotify('Copie indisponible sur ce navigateur');
    }
  }

  const showUncertainty =
    Boolean(result) &&
    (result?.confidence !== 'high' || Boolean(result?.uncertaintyNote?.trim()));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-7 bg-white rounded-3xl border border-zinc-200/80 p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900">
            Mode Langues & Traducteur
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Français, Anglais, Bambara progressif et langues africaines avec phonétique
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {QUICK_PAIRS.map((pair) => {
            const active = sourceLang === pair.from && targetLang === pair.to;
            return (
              <button
                key={pair.label}
                type="button"
                onClick={() => {
                  setSourceLang(pair.from);
                  setTargetLang(pair.to);
                  setResult(null);
                }}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {pair.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleTranslate} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div>
              <label htmlFor="source-lang" className="sr-only">
                Langue source
              </label>
              <select
                id="source-lang"
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-zinc-200 bg-[#F8F7F4] px-3 py-2 text-base sm:text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0D6E4F]/30"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.name}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              aria-label="Inverser les langues"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 inline-flex items-center justify-center transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <div>
              <label htmlFor="target-lang" className="sr-only">
                Langue cible
              </label>
              <select
                id="target-lang"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-zinc-200 bg-[#F8F7F4] px-3 py-2 text-base sm:text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0D6E4F]/30"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.name}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="translate-input" className="sr-only">
              Texte à traduire
            </label>
            <div className="relative">
              <textarea
                id="translate-input"
                rows={3}
                maxLength={400}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder={`Saisissez un texte en ${sourceLang} (ex. Bonjour, comment allez-vous ?)...`}
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-[#F8F7F4] px-4 py-3 pr-14 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0D6E4F]/30 focus:border-[#0D6E4F]"
              />
              <button
                type="button"
                onClick={handleMic}
                aria-label={listening ? 'Arrêter le micro' : 'Dicter le texte'}
                className={`absolute right-2.5 bottom-2.5 min-h-[44px] min-w-[44px] rounded-xl border inline-flex items-center justify-center transition-colors ${
                  listening
                    ? 'bg-red-600 border-red-600 text-white'
                    : micSupported
                      ? 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-400'
                }`}
              >
                {listening ? (
                  <MicOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Mic className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
              <span>
                {sourceLang} → {targetLang}
                {(sourceLang === 'Bambara' || targetLang === 'Bambara') && ' · Bambara en déploiement progressif'}
              </span>
              <span className="font-mono-tabular">{sourceText.length}/400</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !sourceText.trim()}
            className="w-full h-12 rounded-2xl bg-[#0D6E4F] hover:bg-[#09553D] text-white font-medium text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.99]"
          >
            <Languages className="w-4 h-4" aria-hidden="true" />
            <span>{loading ? 'AFRIKA AI réfléchit…' : `Traduire vers ${targetLang}`}</span>
          </button>
        </form>

        {voiceError && (
          <div className="rounded-2xl px-4 py-3 bg-amber-50 border border-amber-200 text-xs text-amber-900">
            {voiceError}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {result && (
          <div className="pt-4 border-t border-zinc-100 space-y-4">
            {showUncertainty && (
              <div
                role="note"
                className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5 text-amber-950"
              >
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold">
                    {result.confidence === 'uncertain'
                      ? 'Traduction incertaine — à confirmer avec un locuteur natif'
                      : 'Confiance modérée — nuances dialectales possibles'}
                  </div>
                  {result.uncertaintyNote && <p className="mt-0.5 text-amber-900">{result.uncertaintyNote}</p>}
                </div>
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="text-xs text-zinc-500">
                  {targetLang} · Guide phonétique inclus
                </div>
                <p className="text-xl sm:text-2xl font-bold text-zinc-900 leading-snug break-words">
                  {result.translation}
                </p>
                <p className="text-sm font-mono-tabular text-[#0D6E4F]">{result.phonetic}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSpeak(result.translation, targetLang)}
                  aria-label="Écouter la prononciation"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 inline-flex items-center justify-center transition-colors"
                >
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy('translation', result.translation)}
                  aria-label="Copier la traduction"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 inline-flex items-center justify-center transition-colors"
                >
                  {copiedKey === 'translation' ? (
                    <Check className="w-4 h-4 text-[#0D6E4F]" aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-sm">
              <div>
                <div className="text-xs font-medium text-zinc-500">Note culturelle</div>
                <p className="text-zinc-700 mt-0.5 leading-relaxed">{result.culturalNote}</p>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Exemple du quotidien</div>
                <p className="text-zinc-900 font-medium mt-0.5">{result.exampleSentence}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{result.exampleMeaning}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="lg:col-span-5 bg-white rounded-3xl border border-zinc-200/80 p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900">Expressions essentielles</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Bambara, Swahili, Yoruba, Zulu, Wolof · Écoute et copie instantanées
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {PHRASE_CATEGORIES.map((category) => {
            const active = phraseCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setPhraseCategory(category)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-zinc-100">
          {filteredPhrases.map((phrase) => (
            <div key={phrase.id} className="py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-zinc-500 truncate">
                  {phrase.language} · {phrase.region}
                </div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5">{phrase.nativeText}</div>
                <div className="text-xs text-zinc-600 mt-0.5">
                  {phrase.english} ·{' '}
                  <span className="font-mono-tabular text-zinc-500">{phrase.phonetic}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSpeak(phrase.nativeText, phrase.language)}
                  aria-label={`Écouter ${phrase.nativeText}`}
                  className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-zinc-100 text-zinc-600 inline-flex items-center justify-center transition-colors"
                >
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy(phrase.id, phrase.nativeText)}
                  aria-label={`Copier ${phrase.nativeText}`}
                  className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-zinc-100 text-zinc-600 inline-flex items-center justify-center transition-colors"
                >
                  {copiedKey === phrase.id ? (
                    <Check className="w-4 h-4 text-[#0D6E4F]" aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
