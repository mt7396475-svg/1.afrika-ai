import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Camera,
  CheckCircle2,
  Compass,
  GraduationCap,
  ImagePlus,
  Info,
  Languages,
  Mic,
  Volume2,
} from 'lucide-react';
import { AskFocusArea } from '../data/afrikaContent';
import { isSpeechRecognitionSupported, isSpeechSynthesisSupported } from '../utils/voice';
import { requestJson } from '../utils/api';
import { prepareImageAttachment, SelectedImageAttachment } from '../utils/image';
import { PWAInstallButton } from './PWAInstallButton';

interface VisionViewProps {
  onLaunchFocus: (focus: AskFocusArea) => void;
  onSelectPhotoForAnalysis: (attachment: SelectedImageAttachment) => void;
  onOpenTranslate: () => void;
  onOpenExplore: () => void;
}

interface HealthState {
  ok: boolean;
  geminiConfigured?: boolean;
}

export function VisionView({
  onLaunchFocus,
  onSelectPhotoForAnalysis,
  onOpenTranslate,
  onOpenExplore,
}: VisionViewProps) {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const micSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  useEffect(() => {
    let active = true;
    requestJson<HealthState>('/api/health')
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch(() => {
        if (active) setHealth({ ok: false, geminiConfigured: false });
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoError(null);
    try {
      const prepared = await prepareImageAttachment(file);
      onSelectPhotoForAnalysis(prepared);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Impossible de préparer l’image.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl border border-zinc-200/80 p-5 sm:p-8 space-y-5">
        <div className="flex items-center gap-3.5">
          <img
            src="/pwa-192x192.png"
            alt="Icône officielle AFRIKA AI"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shadow-md shrink-0"
          />
          <div>
            <div className="text-xs font-medium text-[#0D6E4F]">
              AFRIKA AI · Mode Vision & Feuille de route
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Application installable sur Android et iPhone avec icône dédiée
            </p>
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 max-w-2xl leading-tight">
          Une intelligence artificielle utile, accessible sur téléphone et ancrée dans les réalités africaines.
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 max-w-3xl leading-relaxed">
          AFRIKA AI accompagne les élèves, les entrepreneurs, les voyageurs et les communautés dans leur quotidien : analyse de photos d’exercices et documents, apprentissage étape par étape, traduction progressive vers le bambara et création de projets économiques réalistes.
        </p>

        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void handleFileSelect(e)}
          className="hidden"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => void handleFileSelect(e)}
          className="hidden"
        />

        <div className="pt-1 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="min-h-[48px] px-5 rounded-2xl bg-[#0D6E4F] hover:bg-[#09553D] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors"
          >
            <ImagePlus className="w-4 h-4" aria-hidden="true" />
            <span>Analyser une photo</span>
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="min-h-[48px] px-5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-sm font-medium inline-flex items-center gap-2 transition-colors"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>Prendre une photo</span>
          </button>
          <button
            type="button"
            onClick={() => onLaunchFocus('Étudiant')}
            className="min-h-[48px] px-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors"
          >
            <GraduationCap className="w-4 h-4" aria-hidden="true" />
            <span>Mode Étudiant</span>
          </button>
          <PWAInstallButton showGuideFallback />
        </div>

        <p className="text-xs text-zinc-500">
          Formats acceptés : JPG, PNG, WEBP · Taille maximale : 5 Mo.
        </p>

        {photoError && (
          <div
            role="alert"
            className="rounded-2xl px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {photoError}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onLaunchFocus('Étudiant')}
          className="text-left bg-white rounded-3xl border border-zinc-200/80 p-5 hover:border-zinc-300 transition-colors flex flex-col justify-between gap-4"
        >
          <div className="space-y-2">
            <GraduationCap className="w-5 h-5 text-[#0D6E4F]" aria-hidden="true" />
            <h2 className="text-base font-bold text-zinc-900">1. Mode Étudiant</h2>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Mathématiques, physique et chimie expliquées étape par étape en français simple, par texte ou photo.
            </p>
          </div>
          <div className="text-xs font-medium text-[#0D6E4F] inline-flex items-center gap-1">
            <span>Ouvrir</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenTranslate}
          className="text-left bg-white rounded-3xl border border-zinc-200/80 p-5 hover:border-zinc-300 transition-colors flex flex-col justify-between gap-4"
        >
          <div className="space-y-2">
            <Languages className="w-5 h-5 text-[#0D6E4F]" aria-hidden="true" />
            <h2 className="text-base font-bold text-zinc-900">2. Mode Langues</h2>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Français ↔ Anglais amélioré, ajout progressif du bambara et transparence quand une traduction doit être vérifiée.
            </p>
          </div>
          <div className="text-xs font-medium text-[#0D6E4F] inline-flex items-center gap-1">
            <span>Traduire</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onLaunchFocus('Entrepreneur')}
          className="text-left bg-white rounded-3xl border border-zinc-200/80 p-5 hover:border-zinc-300 transition-colors flex flex-col justify-between gap-4"
        >
          <div className="space-y-2">
            <Briefcase className="w-5 h-5 text-[#0D6E4F]" aria-hidden="true" />
            <h2 className="text-base font-bold text-zinc-900">3. Mode Entrepreneur</h2>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Création de projets, budgets en FCFA, plans de développement à 6 mois et préparation au financement.
            </p>
          </div>
          <div className="text-xs font-medium text-[#0D6E4F] inline-flex items-center gap-1">
            <span>Démarrer un projet</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenExplore}
          className="text-left bg-white rounded-3xl border border-zinc-200/80 p-5 hover:border-zinc-300 transition-colors flex flex-col justify-between gap-4"
        >
          <div className="space-y-2">
            <Compass className="w-5 h-5 text-[#0D6E4F]" aria-hidden="true" />
            <h2 className="text-base font-bold text-zinc-900">4. Culture & Villes</h2>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Guides régionaux sur l’architecture, le textile, la gastronomie et les dynamiques urbaines du continent.
            </p>
          </div>
          <div className="text-xs font-medium text-[#0D6E4F] inline-flex items-center gap-1">
            <span>Explorer</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        </button>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-[#0D6E4F]" aria-hidden="true" />
            <h2 className="text-base font-bold text-zinc-900">
              État réel des fonctions Voix, Vision & API
            </h2>
          </div>

          <div className="divide-y divide-zinc-100 text-sm">
            <div className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-900">Serveur IA & Clé Gemini (Texte + Vision)</div>
                <div className="text-xs text-zinc-500">Requis pour Ask, Images, Traduction et Explore</div>
              </div>
              <span
                className={`text-xs font-medium inline-flex items-center gap-1 ${
                  health?.geminiConfigured ? 'text-[#0D6E4F]' : 'text-amber-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                {health === null
                  ? 'Vérification...'
                  : health.geminiConfigured
                    ? 'Connecté'
                    : 'Clé requise'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-900">Microphone (Dictée vocale)</div>
                <div className="text-xs text-zinc-500">Web Speech Recognition du navigateur</div>
              </div>
              <span
                className={`text-xs font-medium ${
                  micSupported ? 'text-[#0D6E4F]' : 'text-zinc-600'
                }`}
              >
                {micSupported ? 'Disponible' : 'Non supporté ici'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-900">Lecture à voix haute</div>
                <div className="text-xs text-zinc-500">Synthèse vocale du téléphone / navigateur</div>
              </div>
              <span
                className={`text-xs font-medium inline-flex items-center gap-1 ${
                  ttsSupported ? 'text-[#0D6E4F]' : 'text-zinc-600'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                {ttsSupported ? 'Disponible' : 'Indisponible'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#0D6E4F]" aria-hidden="true" />
            <h2 className="text-base font-bold text-zinc-900">
              Comment activer photo, micro et voix sur Android
            </h2>
          </div>
          <ol className="space-y-2.5 text-xs sm:text-sm text-zinc-600 leading-relaxed list-decimal list-inside">
            <li>
              <strong className="text-zinc-900">Photos & Caméra :</strong> Appuyez sur <em>Analyser une photo</em> ou <em>Prendre une photo</em> (JPG, PNG, WEBP, max 5 Mo) puis écrivez votre question ou envoyez directement.
            </li>
            <li>
              <strong className="text-zinc-900">Clé API Gemini :</strong> Dans AI Studio, ouvrez{' '}
              <em>Settings &gt; Secrets</em> et vérifiez que <code className="font-mono-tabular">GEMINI_API_KEY</code> est renseignée.
            </li>
            <li>
              <strong className="text-zinc-900">Microphone sur Android :</strong> Ouvrez l’application dans{' '}
              <strong>Google Chrome</strong> (en HTTPS), appuyez sur le bouton micro puis acceptez{' '}
              <em>Autoriser l’accès au micro</em>.
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}
