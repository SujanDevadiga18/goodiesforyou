module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { packageId } = req.query || {};

  if (!packageId) {
    return res.status(400).json({ error: 'Missing packageId' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Vercel KV not configured on this project. Please link a KV database.' });
  }

  try {
    // Use Upstash Redis REST API to get all replies in the list
    const kvResponse = await fetch(process.env.KV_REST_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['LRANGE', `reply:${packageId}`, '0', '-1'])
    });

    if (!kvResponse.ok) {
      const errText = await kvResponse.text();
      console.error('KV Error:', errText);
      return res.status(500).json({ error: 'Failed to read from database' });
    }

    const data = await kvResponse.json();
    // Upstash returns the array in the "result" field
    const rawReplies = data.result || [];
    const replies = rawReplies.map(r => {
      try {
        return JSON.parse(r);
      } catch (e) {
        return { text: r, timestamp: Date.now() };
      }
    });

    return res.status(200).json({ success: true, replies });
  } catch (error) {
    console.error('Serverless Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
