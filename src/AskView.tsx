import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Briefcase,
  Camera,
  Check,
  Copy,
  GraduationCap,
  ImagePlus,
  Mic,
  MicOff,
  Paperclip,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  ASK_FOCUS_AREAS,
  AskFocusArea,
  ENTREPRENEUR_PROMPTS,
  STARTER_PROMPTS,
  STUDENT_PROMPTS,
} from '../data/afrikaContent';
import {
  BrowserSpeechRecognition,
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  mapSpeechRecognitionError,
  speakText,
  stopSpeaking,
} from '../utils/voice';
import { IMAGE_REQUEST_TIMEOUT_MS, postJson } from '../utils/api';
import {
  formatFileSize,
  prepareImageAttachment,
  SelectedImageAttachment,
} from '../utils/image';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  focus: AskFocusArea;
  imageUrl?: string;
  hasImage?: boolean;
}

interface AskViewProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  focus: AskFocusArea;
  setFocus: (focus: AskFocusArea) => void;
  externalLoading?: boolean;
  pendingImage?: SelectedImageAttachment | null;
  onClearPendingImage?: () => void;
  onNotify: (msg: string) => void;
  onOpenVision: () => void;
}

export function AskView({
  messages,
  setMessages,
  focus,
  setFocus,
  externalLoading = false,
  pendingImage = null,
  onClearPendingImage,
  onNotify,
  onOpenVision,
}: AskViewProps) {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedImageAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [lastFailed, setLastFailed] = useState<{
    prompt: string;
    focus: AskFocusArea;
    image: SelectedImageAttachment | null;
  } | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);
  const isBusy = loading || externalLoading;

  const micSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  useEffect(() => {
    if (pendingImage) {
      setSelectedImage(pendingImage);
      setError(null);
      onClearPendingImage?.();
    }
  }, [pendingImage, onClearPendingImage]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  async function handleImagePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    try {
      const prepared = await prepareImageAttachment(file);
      setSelectedImage(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger cette image.');
    }
  }

  function toggleVoiceInput() {
    setVoiceError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceError(
        'Microphone non supporté par ce navigateur. Utilisez Chrome sur Android ou Safari, ou consultez la page Vision pour la configuration.',
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = 'fr-FR';
      recognition.continuous = false;
      recognition.interimResults = true;

      const baseInput = input.trim();
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i += 1) {
          transcript += event.results[i][0].transcript;
        }
        const combined = baseInput ? `${baseInput} ${transcript.trim()}` : transcript.trim();
        setInput(combined);
      };

      recognition.onerror = (event) => {
        setVoiceError(mapSpeechRecognitionError(event.error));
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setVoiceError('Impossible de démarrer le microphone sur cet appareil.');
      setListening(false);
    }
  }

  function handleSpeakToggle(msgId: string, text: string) {
    if (!ttsSupported) {
      onNotify('Lecture vocale indisponible sur ce navigateur');
      return;
    }
    if (speakingId === msgId) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    const frenchLikely =
      focus === 'Étudiant' ||
      focus === 'Entrepreneur' ||
      /[éèêàùç]/i.test(text);
    const started = speakText(text, frenchLikely ? 'fr-FR' : 'en-US', () => {
      setSpeakingId((curr) => (curr === msgId ? null : curr));
    });
    if (started) {
      setSpeakingId(msgId);
    }
  }

  async function sendPrompt(
    promptText: string,
    overrideFocus?: AskFocusArea,
    retryImage?: SelectedImageAttachment | null,
    isRetry = false,
  ) {
    const trimmed = promptText.trim();
    const imageToSend = retryImage !== undefined ? retryImage : selectedImage;
    if ((!trimmed && !imageToSend) || inFlightRef.current || isBusy) return;

    inFlightRef.current = true;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }

    const activeFocus = overrideFocus ?? focus;
    if (overrideFocus) setFocus(overrideFocus);

    setError(null);
    setVoiceError(null);
    setLastFailed(null);

    const displayUserText =
      trimmed ||
      (activeFocus === 'Étudiant'
        ? 'Analyse et résous cet exercice en image étape par étape.'
        : 'Analyse cette image.');

    const recentHistory = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));

    if (!isRetry) {
      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: displayUserText,
        focus: activeFocus,
        imageUrl: imageToSend?.previewUrl,
        hasImage: Boolean(imageToSend),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setSelectedImage(null);
    }

    setLoadingImage(Boolean(imageToSend));
    setLoading(true);

    requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    try {
      const data = await postJson<{ reply?: string }>(
        '/api/ask',
        {
          message: trimmed,
          focus: activeFocus,
          history: recentHistory,
          ...(imageToSend
            ? {
                image: {
                  mimeType: imageToSend.mimeType,
                  data: imageToSend.base64Data,
                },
              }
            : {}),
        },
        imageToSend ? { timeoutMs: IMAGE_REQUEST_TIMEOUT_MS } : undefined,
      );
      if (!data.reply) {
        throw new Error('Réponse vide du serveur. Veuillez réessayer.');
      }

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.reply,
        focus: activeFocus,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      requestAnimationFrame(() => {
        listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setError(message);
      setLastFailed({
        prompt: trimmed,
        focus: activeFocus,
        image: imageToSend,
      });
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setLoadingImage(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendPrompt(input);
  }

  async function handleCopy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      onNotify('Réponse copiée');
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1600);
    } catch {
      onNotify('Copie indisponible sur ce navigateur');
    }
  }

  const activeStarters =
    focus === 'Étudiant'
      ? STUDENT_PROMPTS.map((item) => ({ ...item, focus: 'Étudiant' as AskFocusArea }))
      : focus === 'Entrepreneur'
        ? ENTREPRENEUR_PROMPTS.map((item) => ({ ...item, focus: 'Entrepreneur' as AskFocusArea }))
        : STARTER_PROMPTS;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
      <div className="lg:col-span-8 flex flex-col bg-white rounded-3xl border border-zinc-200/80 overflow-hidden">
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-zinc-100 flex flex-col gap-3">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900">
                Ask AFRIKA AI
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500">
                {focus === 'Étudiant'
                  ? 'Mode Étudiant · Exercices, texte ou photo expliqués étape par étape'
                  : focus === 'Entrepreneur'
                    ? 'Mode Entrepreneur · Projets, budgets en FCFA et plans de développement'
                    : 'Mémoire active · Texte, voix et analyse d’images (JPG, PNG, WEBP)'}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  setSpeakingId(null);
                  setMessages([]);
                  setSelectedImage(null);
                  setError(null);
                }}
                className="min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-zinc-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Nouvelle</span>
              </button>
            )}
          </div>

          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
            role="tablist"
            aria-label="Modes et catégories de conversation"
          >
            {ASK_FOCUS_AREAS.map((item) => {
              const active = focus === item;
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFocus(item)}
                  className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#0D6E4F] text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70'
                  }`}
                >
                  {item === 'Étudiant' && <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />}
                  {item === 'Entrepreneur' && <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{item}</span>
                </button>
              );
            })}
          </div>

          {messages.length > 0 && (
            <div className="text-[11px] text-zinc-500 font-mono-tabular">
              Mémoire de conversation active · {messages.length}{' '}
              {messages.length > 1 ? 'messages mémorisés' : 'message mémorisé'}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-5 min-h-[300px] max-h-[52dvh] overflow-y-auto space-y-5 overscroll-contain">
          {messages.length === 0 ? (
            <div className="py-2 space-y-5">
              <div className="space-y-2 max-w-xl">
                <p className="text-sm font-medium text-zinc-900">
                  {focus === 'Étudiant'
                    ? 'Écrivez un exercice ou envoyez la photo de votre cahier.'
                    : focus === 'Entrepreneur'
                      ? 'Décrivez votre idée de projet, budget ou plan d’activité.'
                      : 'Posez une question, dictez au micro ou joignez une image à analyser.'}
                </p>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {focus === 'Étudiant'
                    ? 'AFRIKA AI lit vos exercices, documents et captures d’écran et explique chaque étape en français simple.'
                    : focus === 'Entrepreneur'
                      ? 'Obtenez des budgets détaillés, études de marché locales et plans d’action étape par étape.'
                      : 'L’assistant garde en mémoire vos échanges récents et analyse vos photos JPG, PNG ou WEBP.'}
                </p>

                {focus === 'Étudiant' && (
                  <div className="pt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0D6E4F]/10 hover:bg-[#0D6E4F]/15 text-[#0D6E4F] text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                    >
                      <ImagePlus className="w-4 h-4" aria-hidden="true" />
                      <span>Analyser une photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 text-xs font-medium inline-flex items-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" aria-hidden="true" />
                      <span>Prendre une photo</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
                {activeStarters.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => void sendPrompt(starter.prompt, starter.focus)}
                    className="min-h-[48px] text-left p-4 rounded-2xl bg-[#F8F7F4] hover:bg-zinc-100 border border-zinc-200/70 transition-colors active:scale-[0.99]"
                  >
                    <div className="text-xs text-zinc-500 mb-1">{starter.subtitle}</div>
                    <div className="text-sm font-semibold text-zinc-900 leading-snug">
                      {starter.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] text-zinc-500 mb-1 px-1">
                  {msg.role === 'user' ? 'Vous' : 'AFRIKA AI'}
                  <span aria-hidden="true"> · </span>
                  <span>{msg.focus}</span>
                </div>
                <div
                  className={`max-w-[94%] sm:max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap space-y-2.5 ${
                    msg.role === 'user'
                      ? 'bg-[#0D6E4F] text-white'
                      : 'bg-[#F8F7F4] text-zinc-800 border border-zinc-200/70'
                  }`}
                >
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="Image envoyée pour analyse"
                      referrerPolicy="no-referrer"
                      className="max-h-56 w-auto rounded-xl object-cover border border-white/20"
                    />
                  )}
                  {!msg.imageUrl && msg.hasImage && (
                    <div className="text-xs opacity-85 font-medium">
                      Image jointe analysée dans cette session
                    </div>
                  )}
                  <div>{msg.text}</div>
                </div>
                {msg.role === 'assistant' && (
                  <div className="mt-1 flex items-center gap-1">
                    {ttsSupported && (
                      <button
                        type="button"
                        onClick={() => handleSpeakToggle(msg.id, msg.text)}
                        className="min-h-[44px] px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1.5 rounded-xl hover:bg-zinc-100 transition-colors"
                      >
                        {speakingId === msg.id ? (
                          <>
                            <Square className="w-3.5 h-3.5 text-[#0D6E4F]" aria-hidden="true" />
                            <span>Arrêter</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Écouter</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCopy(msg.id, msg.text)}
                      className="min-h-[44px] px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1.5 rounded-xl hover:bg-zinc-100 transition-colors"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#0D6E4F]" aria-hidden="true" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {isBusy && (
            <div className="flex flex-col items-start" role="status" aria-live="polite">
              <div className="text-[11px] text-zinc-500 mb-1 px-1">AFRIKA AI</div>
              <div className="rounded-2xl px-4 py-3 bg-[#F8F7F4] border border-zinc-200/70 text-sm text-zinc-700 inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0D6E4F]" aria-hidden="true" />
                <span>
                  {loadingImage ? 'AFRIKA AI analyse ton image…' : 'AFRIKA AI réfléchit…'}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-2xl px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <span>{error}</span>
              <div className="flex items-center gap-2 shrink-0">
                {lastFailed && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void sendPrompt(lastFailed.prompt, lastFailed.focus, lastFailed.image, true)
                    }
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-red-900 text-white text-xs font-medium hover:bg-red-800 transition-colors"
                  >
                    Réessayer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setLastFailed(null);
                  }}
                  className="min-h-[40px] px-2.5 text-xs font-medium text-red-900 underline"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

          {voiceError && (
            <div
              role="status"
              className="rounded-2xl px-4 py-3 bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <span>{voiceError}</span>
              <button
                type="button"
                onClick={onOpenVision}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-900/10 text-amber-950 text-xs font-medium whitespace-nowrap self-start sm:self-auto"
              >
                Guide Voix
              </button>
            </div>
          )}

          <div ref={listEndRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-3 sm:p-4 border-t border-zinc-100 bg-white space-y-2.5"
        >
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void handleImagePicked(e)}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => void handleImagePicked(e)}
            className="hidden"
          />

          {selectedImage && (
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-[#F8F7F4] border border-zinc-200/80">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={selectedImage.previewUrl}
                  alt="Aperçu de l’image sélectionnée"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover border border-zinc-200 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-900 truncate">
                    {selectedImage.fileName}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono-tabular">
                    {formatFileSize(selectedImage.sizeBytes)} · Prête pour analyse
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                aria-label="Retirer l’image"
                className="min-h-[44px] px-3 rounded-xl hover:bg-zinc-200/70 text-zinc-700 text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                <span>Retirer</span>
              </button>
            </div>
          )}

          <label htmlFor="afrika-ask-input" className="sr-only">
            Posez une question à AFRIKA AI
          </label>
          <textarea
            id="afrika-ask-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendPrompt(input);
              }
            }}
            placeholder={
              listening
                ? 'Écoute en cours... parlez maintenant'
                : selectedImage
                  ? 'Question optionnelle (ex. Résous cet exercice étape par étape)...'
                  : focus === 'Étudiant'
                    ? 'Écrivez votre exercice ou joignez une photo...'
                    : focus === 'Entrepreneur'
                      ? 'Décrivez votre projet, budget ou question...'
                      : `Posez votre question (${focus}) ou joignez une image...`
            }
            className="w-full resize-none rounded-2xl border border-zinc-200 bg-[#F8F7F4] px-3.5 py-3 text-base sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0D6E4F]/30 focus:border-[#0D6E4F]"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isBusy}
                aria-label="Prendre une photo avec l’appareil photo"
                title="Prendre une photo"
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-zinc-200 bg-[#F8F7F4] hover:bg-zinc-100 text-zinc-700 inline-flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Photo</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={isBusy}
                aria-label="Choisir une image depuis la galerie"
                title="Galerie (JPG, PNG, WEBP)"
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-zinc-200 bg-[#F8F7F4] hover:bg-zinc-100 text-zinc-700 inline-flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
              >
                <Paperclip className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Galerie</span>
              </button>

              <button
                type="button"
                onClick={toggleVoiceInput}
                aria-label={listening ? 'Arrêter la dictée vocale' : 'Dicter au microphone'}
                title={
                  micSupported
                    ? listening
                      ? 'Arrêter le micro'
                      : 'Dicter avec le microphone'
                    : 'Microphone non pris en charge sur ce navigateur'
                }
                className={`min-h-[44px] min-w-[44px] rounded-xl border inline-flex items-center justify-center transition-colors shrink-0 ${
                  listening
                    ? 'bg-red-600 border-red-600 text-white'
                    : micSupported
                      ? 'bg-[#F8F7F4] border-zinc-200 text-zinc-700 hover:bg-zinc-100'
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

            <button
              type="submit"
              disabled={isBusy || (!input.trim() && !selectedImage)}
              aria-label="Envoyer le message"
              className="min-h-[46px] px-5 rounded-2xl bg-[#0D6E4F] text-white font-medium text-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#09553D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98] shrink-0"
            >
              <ArrowUp className="w-4 h-4" aria-hidden="true" />
              <span>Envoyer</span>
            </button>
          </div>
        </form>
      </div>

      <aside className="hidden lg:flex lg:col-span-4 flex-col gap-4 bg-white rounded-3xl border border-zinc-200/80 p-6">
        <div>
          <h2 className="text-base font-bold text-zinc-900">
            {focus === 'Étudiant'
              ? 'Exemples Mode Étudiant'
              : focus === 'Entrepreneur'
                ? 'Modèles Mode Entrepreneur'
                : 'Accès Rapide'}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Cliquez sur un sujet ou analysez une photo d’exercice ou de document.
          </p>
        </div>

        {focus === 'Étudiant' && (
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#0D6E4F]/10 hover:bg-[#0D6E4F]/15 text-[#0D6E4F] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <ImagePlus className="w-4 h-4" aria-hidden="true" />
            <span>Analyser une photo</span>
          </button>
        )}

        <div className="divide-y divide-zinc-100">
          {activeStarters.map((starter) => (
            <button
              key={starter.title}
              type="button"
              onClick={() => void sendPrompt(starter.prompt, starter.focus)}
              className="w-full min-h-[56px] py-3.5 text-left hover:bg-zinc-50 rounded-xl px-2.5 -mx-2.5 transition-colors"
            >
              <div className="text-xs text-zinc-500">{starter.subtitle}</div>
              <div className="text-sm font-semibold text-zinc-900 mt-0.5">{starter.title}</div>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
