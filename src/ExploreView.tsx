import { useRef, useState } from 'react';
import { ChevronRight, Compass, Sparkles, Volume2, X } from 'lucide-react';
import { EXPLORE_STORIES, ExploreStory } from '../data/afrikaContent';
import { isSpeechSynthesisSupported, speakText, stopSpeaking } from '../utils/voice';
import { postJson } from '../utils/api';

interface ExploreViewProps {
  onAskAboutTopic: (prompt: string) => void;
}

export function ExploreView({ onAskAboutTopic }: ExploreViewProps) {
  const [selectedStory, setSelectedStory] = useState<ExploreStory | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const inFlightRef = useRef(false);
  const briefCacheRef = useRef<Record<string, string>>({});
  const ttsSupported = isSpeechSynthesisSupported();

  function openStory(story: ExploreStory) {
    setSelectedStory(story);
    setAiBrief(briefCacheRef.current[story.id] ?? null);
    setBriefError(null);
  }

  function closeStory() {
    stopSpeaking();
    setSelectedStory(null);
  }

  async function loadFieldBrief(story: ExploreStory) {
    const cached = briefCacheRef.current[story.id];
    if (cached) {
      setAiBrief(cached);
      setBriefError(null);
      return;
    }
    if (inFlightRef.current || loadingBrief) return;
    inFlightRef.current = true;
    setLoadingBrief(true);
    setBriefError(null);
    try {
      const data = await postJson<{ insight?: string }>('/api/explore', {
        title: story.title,
        region: story.region,
      });
      if (!data.insight) {
        throw new Error('Guide indisponible pour le moment.');
      }
      briefCacheRef.current[story.id] = data.insight;
      setAiBrief(data.insight);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'Could not load field guide.');
    } finally {
      inFlightRef.current = false;
      setLoadingBrief(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900">
            Explore Heritage & Cities
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Curated regional stories with instant AI field notes
          </p>
        </div>
        <div className="text-xs text-zinc-500 font-mono-tabular">3 Regions Featured</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {EXPLORE_STORIES.map((story) => {
          const imageFailed = failedImages[story.id];
          return (
            <button
              key={story.id}
              type="button"
              onClick={() => openStory(story)}
              className="group text-left bg-white rounded-3xl border border-zinc-200/80 overflow-hidden flex flex-col hover:border-zinc-300 transition-colors active:scale-[0.99]"
            >
              <div className="aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
                {imageFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#F1EFEA] to-zinc-200">
                    <Compass className="w-8 h-8 text-[#0D6E4F] mb-2" aria-hidden="true" />
                    <span className="text-xs font-medium text-zinc-700">{story.title}</span>
                  </div>
                ) : (
                  <img
                    src={story.imageUrl}
                    alt={story.imageAlt}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((prev) => ({ ...prev, [story.id]: true }))}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                  />
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs text-zinc-500">
                    {story.theme} · {story.region} · {story.readTime}
                  </div>
                  <h2 className="text-base font-bold text-zinc-900 leading-snug">{story.title}</h2>
                  <p className="text-sm text-zinc-600 leading-relaxed line-clamp-3">
                    {story.summary}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs font-medium text-[#0D6E4F]">
                  <span>Read field notes</span>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedStory && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={closeStory}
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-sheet-title"
        >
          <div
            className="w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-3xl max-h-[88dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="md:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-zinc-300" />
            </div>

            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-zinc-500 truncate">
                  {selectedStory.theme} · {selectedStory.region}
                </div>
                <h2 id="story-sheet-title" className="text-lg font-bold text-zinc-900 truncate">
                  {selectedStory.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeStory}
                aria-label="Close detail sheet"
                className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-zinc-100 text-zinc-600 inline-flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto overscroll-contain space-y-5">
              <p className="text-sm text-zinc-700 leading-relaxed">{selectedStory.summary}</p>

              <div className="rounded-2xl bg-[#F8F7F4] border border-zinc-200/70 p-4 space-y-1">
                <div className="text-xs font-medium text-zinc-500">Local Term</div>
                <div className="text-base font-bold text-zinc-900">{selectedStory.keyTerm}</div>
                <p className="text-sm text-zinc-600">{selectedStory.keyTermMeaning}</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Key Takeaways
                </h3>
                <ul className="space-y-2 text-sm text-zinc-700">
                  {selectedStory.highlights.map((item) => (
                    <li key={item} className="leading-relaxed">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>

              {aiBrief && (
                <div className="rounded-2xl bg-[#0D6E4F]/5 border border-[#0D6E4F]/20 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-[#0D6E4F] inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>AFRIKA AI Field Guide</span>
                    </div>
                    {ttsSupported && (
                      <button
                        type="button"
                        onClick={() => speakText(aiBrief, 'en-US')}
                        className="min-h-[36px] px-2.5 rounded-lg text-xs text-[#0D6E4F] hover:bg-[#0D6E4F]/10 inline-flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Listen</span>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                    {aiBrief}
                  </p>
                </div>
              )}

              {briefError && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  {briefError}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-100 bg-white flex flex-col sm:flex-row gap-2.5 pb-safe">
              <button
                type="button"
                disabled={loadingBrief}
                onClick={() => void loadFieldBrief(selectedStory)}
                className="flex-1 h-12 rounded-2xl bg-[#0D6E4F] hover:bg-[#09553D] text-white font-medium text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>{loadingBrief ? 'AFRIKA AI réfléchit…' : 'Generate AI Field Guide'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedStory;
                  closeStory();
                  onAskAboutTopic(
                    `Tell me more about ${target.title} in ${target.region}, including places to visit or learn more.`,
                  );
                }}
                className="h-12 px-5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-medium text-sm inline-flex items-center justify-center whitespace-nowrap transition-colors"
              >
                Ask in Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
