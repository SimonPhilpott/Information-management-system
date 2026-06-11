import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import { logUsage } from './usageService.js';

// Initialize the SDK
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Generate an image using Google's Imagen model
 * @param {string} prompt - The visual description for the image
 * @returns {Promise<{success: boolean, imageBase64: string, revisedPrompt: string}>}
 */
export async function generateImage(prompt) {
  const modelName = config.gemini.chatModels.image || 'imagen-3.0-generate-001';
  
  console.log(`[ImageService] Generating image for prompt: "${prompt}" using ${modelName}`);

  try {
    // In the 2026 SDK, Imagen is often integrated into the GenerativeAI SDK
    // or accessed via a dedicated client. We'll use the standard model interface.
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // Call the generation method (this matches the projected 2026 SDK pattern)
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Extract base64 image data
    // The response structure for Imagen typically returns an image object or bytes
    const candidates = response.candidates || [];
    const imagePart = candidates[0]?.content?.parts?.find(p => p.inlineData);
    
    if (!imagePart) {
      throw new Error('No image data returned from model');
    }

    const imageBase64 = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

    // Log usage (fixed cost per image)
    logUsage(modelName, 0, 0, 'image_generation');

    return {
      success: true,
      imageBase64,
      revisedPrompt: prompt
    };
  } catch (err) {
    console.error('[ImageService] Error:', err.message);
    
    // Fallback for development if API is not accessible/quota hit
    if (process.env.NODE_ENV === 'development') {
        console.warn('[ImageService] Falling back to placeholder for development');
        return {
            success: true,
            imageBase64: `https://placehold.co/1024x1024/1e2642/f0f2f8?text=${encodeURIComponent(prompt.substring(0, 50))}`,
            revisedPrompt: prompt,
            isPlaceholder: true
        };
    }
    
    throw err;
  }
}
