import config from '../config.js';

/**
 * Validates that the configured models are available in the current API version.
 * If the configured models are not found, it attempts to find fallback "stable" versions.
 */
export async function validateConfiguredModels() {
  try {
    const apiKey = config.gemini.apiKey;
    if (!apiKey) {
      console.warn('[ModelCheck] No Gemini API key found in config.');
      return null;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const availableModels = data.models.map(m => m.name.replace('models/', ''));
    
    console.log(`[ModelCheck] Available models found: ${availableModels.length}`);
    
    const configuredFlash = config.gemini.chatModels.flash;
    const configuredPro = config.gemini.chatModels.pro;
    
    const results = {
      flash: { configured: configuredFlash, available: availableModels.includes(configuredFlash) },
      pro: { configured: configuredPro, available: availableModels.includes(configuredPro) },
      thinking: { configured: config.gemini.chatModels.thinking, available: availableModels.includes(config.gemini.chatModels.thinking) },
      research: { configured: config.gemini.chatModels.research, available: availableModels.includes(config.gemini.chatModels.research) }
    };
    
    if (!results.flash.available) {
      console.warn(`[ModelCheck] WARNING: Configured Flash model '${configuredFlash}' is NOT available.`);
      const flashModels = availableModels.filter(m => m.includes('flash')).sort().reverse();
      if (flashModels.length > 0) {
        console.log(`[ModelCheck] Suggestion: Use '${flashModels[0]}' as fallback.`);
      }
    } else {
      console.log(`[ModelCheck] Flash model '${configuredFlash}' is verified.`);
    }
    
    if (!results.pro.available) {
      console.warn(`[ModelCheck] WARNING: Configured Pro model '${configuredPro}' is NOT available.`);
      const proModels = availableModels.filter(m => m.includes('pro')).sort().reverse();
      if (proModels.length > 0) {
        console.log(`[ModelCheck] Suggestion: Use '${proModels[0]}' as fallback.`);
      }
    } else {
      console.log(`[ModelCheck] Pro model '${configuredPro}' is verified.`);
    }
    
    return results;
  } catch (err) {
    console.error(`[ModelCheck] Failed to validate models:`, err.message);
    return null;
  }
}
