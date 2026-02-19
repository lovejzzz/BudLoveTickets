const BLOB_URL = 'https://jsonblob.com/api/jsonBlob/019c49ac-14dd-7992-b001-261d576927e7';

function normalizeTicket(t = {}) {
  return {
    id: String(t.id || Date.now()),
    title: String(t.title || '').trim(),
    desc: String(t.desc || ''),
    status: ['todo', 'doing', 'done'].includes(t.status) ? t.status : 'todo',
    priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
    category: t.category || 'general',
    owner: t.owner || '',
    tags: Array.isArray(t.tags) ? t.tags : String(t.tags || '').split(',').map(x => x.trim()).filter(Boolean),
    due: t.due || '',
    effort: Number(t.effort) > 0 ? Number(t.effort) : null,
    blockers: t.blockers || '',
    activity: Array.isArray(t.activity) ? t.activity : [],
    created: t.created || new Date().toISOString().slice(0, 10),
    updatedAt: t.updatedAt || new Date().toISOString()
  };
}

function mergeTickets(serverTickets = [], incomingTickets = []) {
  const map = new Map();
  for (const t of serverTickets) map.set(String(t.id), normalizeTicket(t));
  for (const t of incomingTickets) {
    const next = normalizeTicket(t);
    const cur = map.get(next.id);
    if (!cur) {
      map.set(next.id, next);
      continue;
    }
    const curAt = cur.updatedAt || cur.created || '';
    const nextAt = next.updatedAt || next.created || '';
    map.set(next.id, nextAt >= curAt ? next : cur);
  }
  return Array.from(map.values());
}

async function loadBlobSafe() {
  const response = await fetch(BLOB_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Blob read failed (${response.status})`);
  const data = await response.json();
  if (!data || typeof data !== 'object') return { tickets: [], ideas: [], revision: 1 };
  return {
    tickets: Array.isArray(data.tickets) ? data.tickets.map(normalizeTicket) : [],
    ideas: Array.isArray(data.ideas) ? data.ideas : [],
    revision: Number(data.revision || 1)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const data = await loadBlobSafe();
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const server = await loadBlobSafe();
      const incoming = req.body || {};
      const merged = {
        tickets: mergeTickets(server.tickets, Array.isArray(incoming.tickets) ? incoming.tickets : []),
        ideas: Array.isArray(incoming.ideas) ? incoming.ideas : server.ideas,
        revision: server.revision + 1,
        updatedAt: new Date().toISOString(),
        diagnostics: {
          mergedAt: new Date().toISOString(),
          mergedCount: Array.isArray(incoming.tickets) ? incoming.tickets.length : 0,
          serverCountBefore: server.tickets.length
        }
      };

      const writeRes = await fetch(BLOB_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      });
      if (!writeRes.ok) throw new Error(`Blob write failed (${writeRes.status})`);
      return res.status(200).json(merged);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message, hint: 'Data retained locally on client; retry sync later.' });
  }
}
