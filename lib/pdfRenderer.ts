'use client';

// Client-side PDF → Image renderer using PDF.js
// Each page is rendered to a canvas and converted to a blob URL for display
// NOTE: pdfjs-dist is imported dynamically to prevent SSR evaluation errors

/**
 * Renders each page of a PDF file to an image URL (blob URL).
 * For image files, returns a single Object URL directly.
 */
export async function fileToImageUrls(file: File): Promise<string[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    // For images (JPG, PNG, WEBP), return a single Object URL directly
    return [URL.createObjectURL(file)];
  }

  // Dynamically import pdfjs-dist — only runs in browser, never on server
  const pdfjs = await import('pdfjs-dist');

  // Use CDN worker to avoid bundling issues
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  // Render each PDF page to a canvas → blob URL
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const imageUrls: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for sharp display

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d')!;
    // pdfjs-dist v4 types require `canvas` in render params — cast to satisfy compiler
    await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;

    // Convert canvas to a blob URL
    const blob: Blob = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92)
    );
    imageUrls.push(URL.createObjectURL(blob));
  }

  return imageUrls;
}
