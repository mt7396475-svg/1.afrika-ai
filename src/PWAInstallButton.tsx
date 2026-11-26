import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  showGuideFallback?: boolean;
}

export function PWAInstallButton({
  compact = false,
  showGuideFallback = false,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[38px] px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[48px] px-5 rounded-2xl bg-[#0D6E4F] hover:bg-[#09553D] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        <span>Installer l’app</span>
      </button>
    );
  }

  if (!isIOS && !showGuideFallback) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuideModal(true)}
        className={
          compact
            ? 'min-h-[38px] px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[48px] px-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Smartphone className="w-4 h-4" aria-hidden="true" />
        <span>{isIOS ? 'Installer sur iPhone' : 'Ajouter sur l’écran d’accueil'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowGuideModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="Icône AFRIKA AI"
                  className="w-12 h-12 rounded-2xl object-cover shadow-sm"
                />
                <div>
                  <h3 id="pwa-install-title" className="text-base font-bold text-zinc-900">
                    Installer AFRIKA AI
                  </h3>
                  <p className="text-xs text-zinc-500">Accès rapide depuis votre écran d’accueil</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Fermer"
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-zinc-100 text-zinc-600 inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-sm text-zinc-700 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Appuyez sur le bouton <strong>Partager</strong> dans Safari.
                </li>
                <li>
                  Faites défiler et choisissez <strong>Sur l’écran d’accueil</strong>.
                </li>
                <li>
                  Confirmez avec <strong>Ajouter</strong> pour afficher l’icône AFRIKA AI.
                </li>
              </ol>
            ) : (
              <ol className="text-sm text-zinc-700 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Ouvrez le lien de l’application dans <strong>Google Chrome</strong> sur Android.
                </li>
                <li>
                  Appuyez sur le menu <strong>⋮</strong> en haut à droite.
                </li>
                <li>
                  Sélectionnez <strong>Installer l’application</strong> ou{' '}
                  <strong>Ajouter à l’écran d’accueil</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full h-11 rounded-2xl bg-[#0D6E4F] hover:bg-[#09553D] text-white text-sm font-medium transition-colors"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
