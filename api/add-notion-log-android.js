import { Client } from '@notionhq/client';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Reused exact helper function from your iOS script
async function uploadImageToNotion(rawInput, notionToken) {
  try {
    const cleanBase64 = String(rawInput).replace(/^data:image\/\w+;base64,/, '').replace(/[\r\n\s]/g, '');
    if (!cleanBase64) return { id: null, error: 'Empty base64 string' };

    const isPng = cleanBase64.startsWith('iVBORw');
    const contentType = isPng ? 'image/png' : 'image/jpeg';
    const fileExt = isPng ? 'png' : 'jpg';
    const fileName = `photo_upload.${fileExt}`;

    const buffer = Buffer.from(cleanBase64, 'base64');
    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    };

    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: fileName, content_type: contentType }),
    });
    const createData = await createRes.json();
    if (!createData.id) return { id: null, error: createData.message };

    const targetUrl = createData.upload_url || `https://api.notion.com/v1/file_uploads/${createData.id}/send`;
    const blob = new Blob([buffer], { type: contentType });
    const formData = new FormData();
    formData.append('file', blob, fileName);

    const uploadRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${notionToken}`, 'Notion-Version': '2026-03-11' },
      body: formData,
    });

    if (!uploadRes.ok) return { id: null, error: await uploadRes.text() };
    return { id: createData.id, error: null };
  } catch (err) {
    return { id: null, error: err.message };
  }
}

// Bulletproof parser for catching multi-file batches on Vercel
const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    const files = [];

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        files.push({
          filename,
          mimeType,
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const notionToken = req.headers['x-notion-token'];
    const databaseId = req.headers['x-database-id'];

    if (!notionToken || !databaseId) {
      return res.status(401).json({ error: 'Missing Notion Token or Database ID.' });
    }

    // Process the batch payload
    const { fields, files } = await parseForm(req);

    if (files.length === 0) {
      return res.status(400).json({ error: 'No image data received.' });
    }

    // Extract text metadata (supports both URL queries and form fields)
    const title = req.query.title || fields.title || 'Android Photo Log';
    const dateTaken = req.query.dateTaken || fields.dateTaken || new Date().toISOString();
    const latitude = req.query.lat || fields.lat || '';
    const longitude = req.query.lon || fields.lon || '';
    const location = req.query.loc || fields.loc || '';
    let pageId = req.query.pageId || fields.pageId || '';

    console.log(`[Diagnostic] Processing batch of ${files.length} images`);

    // ==========================================
    // STEP 1: CREATE PAGE WITH THE FIRST IMAGE
    // ==========================================
    const firstFile = files[0];
    const firstBase64 = `data:${firstFile.mimeType || 'image/jpeg'};base64,${firstFile.buffer.toString('base64')}`;
    
    const firstUpload = await uploadImageToNotion(firstBase64, notionToken);
    if (firstUpload.error) throw new Error(firstUpload.error);
    
    const firstImageBlock = {
      object: 'block',
      type: 'image',
      image: { type: 'file_upload', file_upload: { id: firstUpload.id } }
    };

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    };

    // If no existing pageId, create the new page
    if (!pageId || String(pageId).trim() === '') {
        let placeProperty = undefined;
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        
        // Location Fallback Logic
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          placeProperty = { place: { lat: latNum, lon: lonNum, name: location && String(location).trim() !== '' ? String(location).trim() : 'Pinned Location' } };
        } else if (location && String(location).trim() !== '') {
          // If Android stripped the GPS, map the user's manually typed location name instead
          placeProperty = { place: { lat: 0, lon: 0, name: String(location).trim() } };
        }

        const properties = {
          Name: { title: [{ text: { content: String(title || 'Untitled Log') } }] },
          'Post-Date': { date: { start: dateTaken } },
        };

        if (placeProperty) properties['Place'] = placeProperty;

        const pagePayload = {
          parent: { database_id: databaseId },
          properties,
          children: [firstImageBlock],
          cover: { type: 'file_upload', file_upload: { id: firstUpload.id } }
        };

        const createRes = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify(pagePayload) });
        const createData = await createRes.json();
        if (createData.object === 'error') throw new Error(createData.message);
        
        pageId = createData.id;
    } else {
        // Append the first image if pageId already existed
        const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', headers, body: JSON.stringify({ children: [firstImageBlock] }) });
        const appendData = await appendRes.json();
        if (appendData.object === 'error') throw new Error(appendData.message);
    }

    // ==========================================
    // STEP 2: LOOP AND APPEND REMAINING IMAGES
    // ==========================================
    for (let i = 1; i < files.length; i++) {
        const currentFile = files[i];
        const currentBase64 = `data:${currentFile.mimeType || 'image/jpeg'};base64,${currentFile.buffer.toString('base64')}`;
        
        const currentUpload = await uploadImageToNotion(currentBase64, notionToken);
        if (currentUpload.error) continue; // Silently skip a corrupted file to keep the batch moving

        const currentImageBlock = {
          object: 'block',
          type: 'image',
          image: { type: 'file_upload', file_upload: { id: currentUpload.id } }
        };

        await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', headers, body: JSON.stringify({ children: [currentImageBlock] }) });
    }

    return res.status(200).json({ success: true, pageId: pageId });
  } catch (err) {
    console.error('Error processing batch request:', err);
    return res.status(500).json({ error: err.message });
  }
}