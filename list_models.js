const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Note: ListModels is not exposed in the standard TS SDK directly, but we can fetch it via REST
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
  const data = await response.json();
  
  console.log("Available models:");
  data.models.forEach(m => {
    if (m.name.includes('flash')) {
      console.log(m.name);
    }
  });
}

listModels().catch(console.error);
