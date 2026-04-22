import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).listModels();
    // Wait, listModels is NOT on the model object usually.
    // It's a top level thing but the SDK might not expose it easily without the client.
    console.log("Checking model access...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const res = await model.generateContent("Hello?");
    console.log("Success:", res.response.text());
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

listModels();
