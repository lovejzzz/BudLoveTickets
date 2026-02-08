export default async function handler(req, res) {
  const BLOB_ID = '019c3e83-e367-72fd-afe8-3486a6482e46';
  const url = `https://jsonblob.com/api/jsonBlob/${BLOB_ID}`;
  
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await response.json();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
