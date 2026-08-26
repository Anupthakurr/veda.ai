import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function main() {
  try {
    const env = fs.readFileSync('.env.local', 'utf-8');
    const key = env.split('\n').find(l => l.startsWith('GEMINI_API_KEY='))?.split('=')[1]?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    console.log("Using key:", key.substring(0, 10) + "...");
    
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    
    console.log("Testing generateContent...");
    const result = await model.generateContent("Hello!");
    console.log("Response:", result.response.text());
  } catch (err) {
    console.error("Error:", err);
  }
}
main();
