import { Client } from '@notionhq/client';
import exifr from 'exifr'; // <-- Add this new import

export const config = {
// ...

// Disable Vercel's default JSON parser so we can read the raw binary stream natively
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Catch user's personal Notion credentials dynamically from headers
    const notionToken = req.headers['x-notion-token'];
    const databaseId = req.headers['x-database-id'];

    if (!notionToken || !databaseId) {
      return res.status(401).json({ error: 'Missing Notion Token or Database ID in request headers.' });
    }

// 2. Extract text metadata (Change const to let for latitude/longitude so we can override them)
    const title = req.query.title || 'Android Photo Log';
    const dateTaken = req.query.dateTaken || new Date().toISOString();
    let latitude = req.query.lat || '';
    let longitude = req.query.lon || '';
    const location = req.query.loc || '';
    const pageId = req.query.pageId || '';

    // 3. Read the raw binary file data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No image data received in the request body.' });
    }

    // ==========================================
    // NEW: BULLETPROOF GPS EXTRACTION
    // ==========================================
    try {
      const gpsData = await exifr.gps(fileBuffer);
      if (gpsData && gpsData.latitude && gpsData.longitude) {
        latitude = gpsData.latitude;
        longitude = gpsData.longitude;
        console.log(`[Diagnostic] Successfully extracted GPS from image: ${latitude}, ${longitude}`);
      } else {
        console.log('[Diagnostic] No GPS data found in the image EXIF.');
      }
    } catch (e) {
      console.log('[Diagnostic] EXIF parsing error:', e.message);
    }
    // ==========================================

    // Convert raw buffer to Base64 to feed into your existing iOS function
    const base64Data = fileBuffer.toString('base64');
    const imageBase64 = `data:image/jpeg;base64,${base64Data}`;

    console.log(`[Diagnostic] Attempting to send to Notion Database ID: ${databaseId}`);

    // ==========================================
    // SEAMLESS INTEGRATION OF iOS NOTION LOGIC 
    // ==========================================

    const uploadResult = await uploadImageToNotion(imageBase64, notionToken);
    if (uploadResult.error) return res.status(400).json({ error: uploadResult.error });
    const fileId = uploadResult.id;

    const imageBlock = {
      object: 'block',
      type: 'image',
      image: { type: 'file_upload', file_upload: { id: fileId } }
    };

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    };

    // IF PAGE ID EXISTS -> Append image block
    if (pageId && String(pageId).trim() !== '') {
      const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ children: [imageBlock] })
      });
      const appendData = await appendRes.json();
      if (appendData.object === 'error') return res.status(400).json({ error: appendData.message });
      
      return res.status(200).json({ success: true, pageId: String(pageId).trim() });
    }

    // IF NO PAGE ID -> Create a brand new page
    let validIsoDate = new Date().toISOString();
    if (dateTaken && !isNaN(new Date(dateTaken).getTime())) validIsoDate = new Date(dateTaken).toISOString();

    let placeProperty = undefined;
    const latNum = parseFloat(latitude);
    const lonNum = parseFloat(longitude);
    
    if (!isNaN(latNum) && !isNaN(lonNum)) {
      placeProperty = {
        place: {
          lat: latNum,
          lon: lonNum,
          name: location && String(location).trim() !== '' ? String(location).trim() : 'Pinned Location'
        }
      };
    }

    const properties = {
      Name: { title: [{ text: { content: String(title || 'Untitled Log') } }] },
      'Post-Date': { date: { start: validIsoDate } },
    };

    if (placeProperty) {
      properties['Place'] = placeProperty;
    }

    const pagePayload = {
      parent: { database_id: databaseId },
      properties,
      children: [imageBlock],
      cover: { type: 'file_upload', file_upload: { id: fileId } }
    };

    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify(pagePayload),
    });
    const createData = await createRes.json();

    if (createData.object === 'error') return res.status(400).json({ error: createData.message });

    return res.status(200).json({ success: true, pageId: createData.id });
  } catch (err) {
    console.error('Error processing request:', err);
    return res.status(500).json({ error: err.message });
  }
}