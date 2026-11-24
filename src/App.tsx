import { useEffect, useRef, useState } from 'react';
import { Compass, Globe, Languages, MessageSquare, Plus } from 'lucide-react';
import { AskView, ChatMessage } from './components/AskView';
import { ExploreView } from './components/ExploreView';
import { TranslateView } from './components/TranslateView';
import { VisionView } from './components/VisionView';
import { ASK_FOCUS_AREAS, AskFocusArea } from './data/afrikaContent';
import { stopSpeaking } from './utils/voice';
import { postJson } from './utils/api';
import { SelectedImageAttachment } from './utils/image';
import { PWAInstallButton } from './components/PWAInstallButton';

type AppTab = 'ask' | 'translate' | 'explore' | 'vision';

const STORAGE_KEY = 'afrika_ai_conversation_v2';

function loadSavedConversation(): { messages: ChatMessage[]; focus: AskFocusArea } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], focus: 'General' };
    const parsed = JSON.parse(raw) as { messages?: ChatMessage[]; focus?: AskFocusArea };
    const validMessages = Array.isArray(parsed.messages)
      ? parsed.messages.filter(
          (m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.text === 'string' &&
            typeof m.id === 'string',
        )
      : [];
    const validFocus = ASK_FOCUS_AREAS.includes(parsed.focus as AskFocusArea)
      ? (parsed.focus as AskFocusArea)
      : 'General';
    return { messages: validMessages, focus: validFocus };
  } catch {
    return { messages: [], focus: 'General' };
  }
}

export default function App() {
  const [initialState] = useState(loadSavedConversation);
  const [activeTab, setActiveTab] = useState<AppTab>('ask');
  const [messages, setMessages] = useState<ChatMessage[]>(initialState.messages);
  const [focus, setFocus] = useState<AskFocusArea>(initialState.focus);
  const [toast, setToast] = useState<string | null>(null);
  const [exploreAskLoading, setExploreAskLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<SelectedImageAttachment | null>(null);
  const exploreInFlightRef = useRef(false);

  useEffect(() => {
    try {
      const compactMessages = messages.slice(-24).map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        focus: m.focus,
        hasImage: m.hasImage || Boolean(m.imageUrl),
      }));
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages: compactMessages, focus }),
      );
    } catch {
      // Ignore storage quota errors in private browsing
    }
  }, [messages, focus]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2200);
  }

  function handleNewChat() {
    stopSpeaking();
    setMessages([]);
    setFocus('General');
    setActiveTab('ask');
    showToast('Nouvelle conversation démarrée');
  }

  function handleAskFromExplore(prompt: string) {
    if (exploreInFlightRef.current) return;
    exploreInFlightRef.current = true;
    setExploreAskLoading(true);
    setActiveTab('ask');
    setFocus('Cities & Travel');
    const priorHistory = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: 'user',
        text: prompt,
        focus: 'Cities & Travel',
      },
    ]);

    void postJson<{ reply?: string }>('/api/ask', {
      message: prompt,
      focus: 'Cities & Travel',
      history: priorHistory,
    })
      .then((data) => {
        if (!data.reply) {
          throw new Error('Réponse vide du serveur.');
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: data.reply as string,
            focus: 'Cities & Travel',
          },
        ]);
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : 'Erreur lors de la requête.';
        showToast(errorMsg);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            role: 'assistant',
            text: `Impossible d’obtenir une réponse pour le moment : ${errorMsg}`,
            focus: 'Cities & Travel',
          },
        ]);
      })
      .finally(() => {
        exploreInFlightRef.current = false;
        setExploreAskLoading(false);
      });
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8F7F4] text-zinc-900 flex flex-col">
      {/* Desktop Top Bar (3-zone contract) */}
      <header className="hidden md:block bg-white/90 backdrop-blur-md border-b border-zinc-200/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('ask');
            }}
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            <img
              src="/pwa-192x192.png"
              alt="Logo AFRIKA AI"
              className="w-8 h-8 rounded-xl object-cover shadow-sm"
            />
            <span>AFRIKA AI</span>
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium" aria-label="Primary navigation">
            <button
              type="button"
              onClick={() => setActiveTab('ask')}
              className={`py-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'ask'
                  ? 'text-[#0D6E4F] underline underline-offset-8 decoration-2'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('translate')}
              className={`py-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'translate'
                  ? 'text-[#0D6E4F] underline underline-offset-8 decoration-2'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Translate
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className={`py-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'explore'
                  ? 'text-[#0D6E4F] underline underline-offset-8 decoration-2'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Explore
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vision')}
              className={`py-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'vision'
                  ? 'text-[#0D6E4F] underline underline-offset-8 decoration-2'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Vision
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={handleNewChat}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0D6E4F] hover:bg-[#09553D] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Nouvelle conversation</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Non-Sticky Compact Top Header */}
      <header className="md:hidden px-4 h-13 flex items-center justify-between border-b border-zinc-200/70 bg-white">
        <div className="inline-flex items-center gap-2 shrink-0">
          <img
            src="/pwa-192x192.png"
            alt="Logo AFRIKA AI"
            className="w-7 h-7 rounded-lg object-cover shadow-sm"
          />
          <span className="font-display text-base font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0">
            AFRIKA AI
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={handleNewChat}
            className="min-h-[44px] px-3 text-xs font-medium text-[#0D6E4F] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nouvelle</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 py-4 sm:py-8 pb-24 md:pb-10">
        {activeTab === 'ask' && (
          <AskView
            messages={messages}
            setMessages={setMessages}
            focus={focus}
            setFocus={setFocus}
            externalLoading={exploreAskLoading}
            pendingImage={pendingImage}
            onClearPendingImage={() => setPendingImage(null)}
            onNotify={showToast}
            onOpenVision={() => setActiveTab('vision')}
          />
        )}
        {activeTab === 'translate' && <TranslateView onNotify={showToast} />}
        {activeTab === 'explore' && <ExploreView onAskAboutTopic={handleAskFromExplore} />}
        {activeTab === 'vision' && (
          <VisionView
            onLaunchFocus={(targetFocus) => {
              setFocus(targetFocus);
              setActiveTab('ask');
            }}
            onSelectPhotoForAnalysis={(attachment) => {
              setPendingImage(attachment);
              setActiveTab('ask');
            }}
            onOpenTranslate={() => setActiveTab('translate')}
            onOpenExplore={() => setActiveTab('explore')}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('ask')}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'ask' ? 'text-[#0D6E4F]' : 'text-zinc-500'
            }`}
          >
            <MessageSquare className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-tight mt-1">Ask</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('translate')}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'translate' ? 'text-[#0D6E4F]' : 'text-zinc-500'
            }`}
          >
            <Languages className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-tight mt-1">Langues</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'explore' ? 'text-[#0D6E4F]' : 'text-zinc-500'
            }`}
          >
            <Compass className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-tight mt-1">Explore</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vision')}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'vision' ? 'text-[#0D6E4F]' : 'text-zinc-500'
            }`}
          >
            <Globe className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-tight mt-1">Vision</span>
          </button>
        </div>
      </nav>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-medium shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
