import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function main() {
  try {
    const env = fs.readFileSync('.env.local', 'utf-8');
    const key = env.split('\n').find(l => l.startsWith('GEMINI_API_KEY='))?.split('=')[1]?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    console.log("Using key:", key.substring(0, 10) + "...");
    const genAI = new GoogleGenerativeAI(key);
    console.log("Fetching models...");
    
    // We can fetch via direct fetch to see the models since the SDK might not expose listModels natively in all versions
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!response.ok) {
        console.error("List Models Failed:", response.status, await response.text());
        return;
    }
    const data = await response.json();
    console.log("Available Models:", data.models.map((m: any) => m.name).join(", "));
  } catch (err) {
    console.error("Error:", err);
  }
}
main();
