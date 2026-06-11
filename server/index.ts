import express from 'express';
import { MongoClient } from 'mongodb';

declare const process: {
  env: Record<string, string | undefined>;
};

const app = express();
const port = Number(process.env.PORT ?? 3001);
const mongoUri = process.env.MONGODB_URI ?? '';

app.use(express.json());

let clientPromise: Promise<MongoClient> | null = null;

function getMongoClient() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(mongoUri).connect();
  }

  return clientPromise;
}

app.get('/api/health', async (_request, response) => {
  if (!mongoUri) {
    response.json({ ok: true, mongo: 'disabled' });
    return;
  }

  try {
    const client = await getMongoClient();
    await client.db().command({ ping: 1 });
    response.json({ ok: true, mongo: 'connected' });
  } catch {
    response.json({ ok: true, mongo: 'error' });
  }
});

app.get('/api/messages', async (_request, response) => {
  if (!mongoUri) {
    response.json({ items: [] });
    return;
  }

  const client = await getMongoClient();
  const items = await client
    .db('sandbox')
    .collection('messages')
    .find({}, { sort: { createdAt: -1 }, limit: 10 })
    .toArray();

  response.json({
    items: items.map((item) => ({
      id: item._id.toString(),
      text: String(item.text),
      createdAt: new Date(item.createdAt).toISOString(),
    })),
  });
});

app.post('/api/messages', async (request, response) => {
  if (!mongoUri) {
    response.status(503).json({ error: 'Set MONGODB_URI to enable message storage.' });
    return;
  }

  const text = String(request.body?.text ?? '').trim();

  if (!text) {
    response.status(400).json({ error: 'text is required' });
    return;
  }

  const client = await getMongoClient();
  const result = await client.db('sandbox').collection('messages').insertOne({
    text,
    createdAt: new Date(),
  });

  response.status(201).json({
    id: result.insertedId.toString(),
    text,
    createdAt: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});