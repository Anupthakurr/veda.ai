'use client';

// Client-side PDF → Image renderer using PDF.js
// Each page is rendered to a canvas and converted to a blob URL for display

import * as pdfjs from 'pdfjs-dist';

// Use CDN worker to avoid bundling issues
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

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

  // For PDFs, render each page to a canvas → blob URL
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
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert canvas to a blob URL
    const blob: Blob = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92)
    );
    imageUrls.push(URL.createObjectURL(blob));
  }

  return imageUrls;
}
