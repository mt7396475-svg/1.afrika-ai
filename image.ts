export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1024;
export const MOBILE_TARGET_SKIP_BYTES = 180 * 1024;
export const IMAGE_COMPRESSION_QUALITY = 0.78;

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface SelectedImageAttachment {
  mimeType: (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
  base64Data: string;
  previewUrl: string;
  fileName: string;
  sizeBytes: number;
  originalSizeBytes: number;
  width?: number;
  height?: number;
}

function resolveMimeType(file: File): (typeof ALLOWED_IMAGE_MIME_TYPES)[number] | null {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';

  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire le fichier image.'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur lors de la lecture de l’image.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de décoder cette image.'));
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function prepareImageAttachment(file: File): Promise<SelectedImageAttachment> {
  const originalMime = resolveMimeType(file);
  if (!originalMime) {
    throw new Error('Format non supporté. Choisissez une image JPG, PNG ou WEBP.');
  }

  if (file.size <= 0) {
    throw new Error('Le fichier sélectionné est vide.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image trop volumineuse (${formatFileSize(file.size)}). La limite maximale est de 5 Mo.`,
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    const maxDim = Math.max(origW, origH);

    // Keep small, already-sharp images as-is
    if (maxDim <= MAX_IMAGE_DIMENSION && file.size <= MOBILE_TARGET_SKIP_BYTES) {
      const dataUrl = await readFileAsDataUrl(file);
      const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1);
      return {
        mimeType: originalMime,
        base64Data,
        previewUrl: dataUrl,
        fileName: file.name || 'photo.jpg',
        sizeBytes: file.size,
        originalSizeBytes: file.size,
        width: origW,
        height: origH,
      };
    }

    const scale = maxDim > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxDim : 1;
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      const dataUrl = await readFileAsDataUrl(file);
      const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1);
      return {
        mimeType: originalMime,
        base64Data,
        previewUrl: dataUrl,
        fileName: file.name || 'photo.jpg',
        sizeBytes: file.size,
        originalSizeBytes: file.size,
        width: origW,
        height: origH,
      };
    }

    const targetMime: 'image/webp' | 'image/jpeg' =
      originalMime === 'image/webp' ? 'image/webp' : 'image/jpeg';

    if (targetMime === 'image/jpeg') {
      // Fill white background so transparent PNG screenshots stay readable
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let compressedBlob = await canvasToBlob(canvas, targetMime, IMAGE_COMPRESSION_QUALITY);
    let finalMime: (typeof ALLOWED_IMAGE_MIME_TYPES)[number] = targetMime;

    if (!compressedBlob || (targetMime === 'image/webp' && compressedBlob.type !== 'image/webp')) {
      compressedBlob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_COMPRESSION_QUALITY);
      finalMime = 'image/jpeg';
    }

    if (!compressedBlob || (maxDim <= MAX_IMAGE_DIMENSION && compressedBlob.size >= file.size)) {
      const dataUrl = await readFileAsDataUrl(file);
      const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1);
      return {
        mimeType: originalMime,
        base64Data,
        previewUrl: dataUrl,
        fileName: file.name || 'photo.jpg',
        sizeBytes: file.size,
        originalSizeBytes: file.size,
        width: origW,
        height: origH,
      };
    }

    const dataUrl = await readFileAsDataUrl(compressedBlob);
    const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1);

    return {
      mimeType: finalMime,
      base64Data,
      previewUrl: dataUrl,
      fileName: file.name || 'photo.jpg',
      sizeBytes: compressedBlob.size,
      originalSizeBytes: file.size,
      width: targetW,
      height: targetH,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
