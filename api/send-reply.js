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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { packageId, message } = req.body || {};

  if (!packageId || !message) {
    return res.status(400).json({ error: 'Missing packageId or message' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Vercel KV not configured on this project. Please link a KV database.' });
  }

  try {
    const replyObj = {
      text: message,
      timestamp: Date.now()
    };

    // Use Upstash Redis REST API to atomically RPUSH the reply to a list
    const kvResponse = await fetch(process.env.KV_REST_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['RPUSH', `reply:${packageId}`, JSON.stringify(replyObj)])
    });

    if (!kvResponse.ok) {
      const errText = await kvResponse.text();
      console.error('KV Error:', errText);
      return res.status(500).json({ error: 'Failed to write to database' });
    }

    // Set TTL on the reply list so it expires after 30 days (prevent clutter)
    await fetch(process.env.KV_REST_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['EXPIRE', `reply:${packageId}`, '2592000']) // 30 days
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Serverless Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
