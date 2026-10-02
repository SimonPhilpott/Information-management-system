const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testAuthUrl() {
  const url = 'http://localhost:3001/api/auth/url';
  console.log(`Testing ${url}...`);
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Headers:', res.headers.raw());
    console.log('Body:', text);
    if (text) {
      try {
        const json = JSON.parse(text);
        console.log('JSON:', json);
      } catch (e) {
        console.log('Failed to parse JSON:', e.message);
      }
    }
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

testAuthUrl();
