# VedaAI — AI Assessment Extraction & Answer Mapping

> Automatically extract questions from a question paper, map student handwritten answers, and deliver AI-powered grading with visual highlights.

## 🚀 Live Demo
*[Add Vercel URL after deployment]*

## ⚙️ Setup

### 1. Clone the repo
```bash
git clone <your-repo>
cd veda.ai
npm install
```

### 2. Add your Gemini API key
Create a `.env.local` file:
```env
GEMINI_API_KEY=your_key_here
```
Get a free key at: https://aistudio.google.com/app/apikey

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:3000

## 🏗️ Architecture

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Vanilla CSS · Google Gemini 1.5 Flash

**AI Pipeline:**
1. **Question Extraction** — Gemini Vision reads the question paper, extracts all questions in order, handles sub-parts (11a, 11b) as separate entries
2. **Answer Extraction** — Gemini Vision processes each answer sheet page with OCR, extracts handwritten text and bounding boxes (normalised 0–1 coordinates)
3. **Answer Mapping** — Gemini matches each answer region to its corresponding question, handles out-of-order answers, flags unanswered questions and unmatched answers
4. **Grading & Feedback** — Gemini evaluates each Q&A pair, awards marks, and generates feedback; calculates total score, percentage, and grade

**Highlighting:** When a teacher clicks a question, the corresponding answer region's normalised bounding box is scaled onto an HTML5 Canvas overlay rendered on top of the answer sheet image.

## 📁 Structure
```
app/
  page.tsx              # Upload page
  processing/page.tsx   # Progress page  
  review/page.tsx       # Main review (question list + viewer + feedback)
  api/analyze/route.ts  # API: orchestrates Gemini pipeline
lib/
  gemini.ts             # Gemini API client (extraction, mapping, grading)
  types.ts              # TypeScript interfaces
```

## 🎯 Features
- ✅ Drag-and-drop upload (PDF, JPG, PNG)
- ✅ Multi-page answer sheets
- ✅ Sub-parts as separate questions (11a, 11b)
- ✅ Out-of-order answer handling
- ✅ Unanswered question detection
- ✅ Unmatched answer detection
- ✅ Visual bounding box highlight on answer sheet
- ✅ Per-question AI feedback
- ✅ Overall grade and score summary

## 🤖 AI Model
**Google Gemini 1.5 Flash** (free tier)
- Multimodal vision capabilities for PDF/image understanding
- High accuracy OCR for handwritten text
- Strong instruction following for structured JSON output

## ⚠️ Assumptions & Limitations
- Bounding boxes are approximate (LLM-generated, not pixel-perfect)
- Very poor handwriting may reduce OCR accuracy
- Large PDFs (>50MB) may timeout — recommend splitting into pages
- Free tier rate limits may apply for large batches
