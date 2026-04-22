import { searchSimilar } from '../server/services/vectorStore.js';
import { generateQueryEmbedding } from '../server/services/embeddingService.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const query = "What is agentic workflows?";
  console.log(`Searching for: "${query}"`);
  
  try {
    const embedding = await generateQueryEmbedding(query);
    console.log("Generated embedding...");
    
    // Test with 'ai' and 'python' subjects
    const results = await searchSimilar(embedding, ['AI', 'Python'], 5);
    
    console.log(`Found ${results.length} results:`);
    results.forEach((r, i) => {
      console.log(`${i+1}. [${r.filename}, p. ${r.pageNum}] (Score: ${r.similarity.toFixed(4)})`);
      console.log(`   Text: ${r.text.substring(0, 100)}...`);
    });
  } catch (err) {
    console.error("Search failed:", err);
  }
}

test();
