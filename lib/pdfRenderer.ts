'use client';

// Client-side PDF → Image renderer using PDF.js
// NOTE: pdfjs-dist is imported dynamically to prevent SSR evaluation errors

/**
 * Renders each page of a PDF/image file to:
 * - A high-quality display URL (2x scale, for the viewer)
 * - A compressed blob (1x scale, 0.7 JPEG quality) for API transmission
 */
async function getPdfjsLib() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  return pdfjs;
}

async function renderPageToCanvas(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof getPdfjsLib>>['getDocument']>['promise']>['getPage'] extends (n: number) => Promise<infer P> ? P : never,
  scale: number
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
  return canvas;
}

/** For DISPLAY — high quality (2x scale, 0.92 JPEG) */
export async function fileToImageUrls(file: File): Promise<string[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return [URL.createObjectURL(file)];

  const pdfjs = await getPdfjsLib();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const urls: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const canvas = await renderPageToCanvas(page, 2.0);
    const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.92));
    urls.push(URL.createObjectURL(blob));
  }
  return urls;
}

/** For API TRANSMISSION — compressed (1x scale, 0.7 JPEG) to stay under Vercel's 4.5 MB body limit */
export async function fileToImageBlobs(file: File): Promise<Blob[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    // For images, re-compress to JPEG 0.7 quality to keep size small
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        canvas.toBlob(b => { URL.revokeObjectURL(url); resolve([b!]); }, 'image/jpeg', 0.7);
      };
      img.src = url;
    });
  }

  const pdfjs = await getPdfjsLib();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const blobs: Blob[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const canvas = await renderPageToCanvas(page, 1.0); // 1x scale for small size
    const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.7));
    blobs.push(blob);
  }
  return blobs;
}
