import { processMessage } from './server/services/chatService.js';
import config from './server/config.js';

async function testChat() {
  console.log('Testing Chat Service...');
  console.log('Configured Flash:', config.gemini.chatModels.flash);
  console.log('API Key starts with:', config.gemini.apiKey.substring(0, 10));
  
  try {
    const result = await processMessage('Hello', null, [], 'flash', 'kb');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Chat Test Failed:', err);
  }
}

testChat();
