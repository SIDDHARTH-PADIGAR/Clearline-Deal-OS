const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

export async function callAI(systemPrompt, userContent) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });
  if (!res.ok) {
    let errText = await res.text();
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error && parsed.error.message) errText = parsed.error.message;
    } catch (e) {}
    throw new Error(`Groq Error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}
