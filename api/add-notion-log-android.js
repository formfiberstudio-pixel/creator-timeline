import { Client } from '@notionhq/client';
import exifr from 'exifr';

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

export async function POST(req) {
  try {
    const notionToken = req.headers.get('x-notion-token');
    const databaseId = req.headers.get('x-database-id');

    if (!notionToken || !databaseId) {
      return Response.json({ error: 'Missing Notion Token or Database ID in request headers.' }, { status: 401 });
    }

    const url = new URL(req.url);
    const titleQuery = url.searchParams.get('title');
    const dateTakenQuery = url.searchParams.get('dateTaken');
    const pageIdQuery = url.searchParams.get('pageId');

    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let files = [];
    let fields = {};

    console.log('[Diagnostic] Incoming Content-Type:', contentType);

    // 1. Parse Multipart Form-Data safely (Case-insensitive check)
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await req.formData();
        for (const [key, value] of formData.entries()) {
          console.log(`[Diagnostic] Form entry found -> Key: ${key}, Type: ${typeof value}`);
          if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
            files.push({
              filename: value.name || 'photo.jpg',
              mimeType: value.type || 'image/jpeg',
              buffer: Buffer.from(await value.arrayBuffer())
            });
          } else {
            fields[key] = value;
          }
        }
      } catch (err) {
        console.error('[Diagnostic] Multipart parsing exception:', err.message);
      }
    }

    // 2. Fallback: Raw binary stream parsing if form-data yielded no files
    if (files.length === 0) {
      try {
        const arrayBuffer = await req.arrayBuffer();
        if (arrayBuffer && arrayBuffer.byteLength > 0) {
          files.push({
            filename: 'photo_upload.jpg',
            mimeType: contentType.includes('image/') ? contentType : 'image/jpeg',
            buffer: Buffer.from(arrayBuffer)
          });
          console.log('[Diagnostic] Raw stream fallback captured buffer of size:', arrayBuffer.byteLength);
        }
      } catch (err) {
        console.error('[Diagnostic] Raw stream fallback error:', err.message);
      }
    }

    if (files.length === 0) {
      return Response.json({ error: 'No image data received in the request body.' }, { status: 400 });
    }

    const title = titleQuery || fields.title || 'Android Photo Log';
    const dateTaken = dateTakenQuery || fields.dateTaken || new Date().toISOString();
    let pageId = pageIdQuery || fields.pageId || '';

    let latitude = '';
    let longitude = '';

    try {
      const gpsData = await exifr.gps(files[0].buffer);
      if (gpsData && gpsData.latitude && gpsData.longitude) {
        latitude = gpsData.latitude;
        longitude = gpsData.longitude;
        console.log(`[Diagnostic] Automatically extracted GPS: ${latitude}, ${longitude}`);
      }
    } catch (e) {
      console.log('[Diagnostic] EXIF GPS extraction skipped.');
    }

    console.log(`[Diagnostic] Processing batch of ${files.length} images for Notion`);

    // ==========================================
    // STEP 1: CREATE PAGE WITH THE FIRST IMAGE
    // ==========================================
    const firstFile = files[0];
    const firstBase64 = `data:${firstFile.mimeType};base64,${firstFile.buffer.toString('base64')}`;
    
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

    if (!pageId || String(pageId).trim() === '') {
        let placeProperty = undefined;
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          placeProperty = { place: { lat: latNum, lon: lonNum, name: 'Pinned Location' } };
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
        const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', headers, body: JSON.stringify({ children: [firstImageBlock] }) });
        const appendData = await appendRes.json();
        if (appendData.object === 'error') throw new Error(appendData.message);
    }

    // ==========================================
    // STEP 2: LOOP AND APPEND REMAINING IMAGES
    // ==========================================
    for (let i = 1; i < files.length; i++) {
        const currentFile = files[i];
        const currentBase64 = `data:${currentFile.mimeType};base64,${currentFile.buffer.toString('base64')}`;
        
        const currentUpload = await uploadImageToNotion(currentBase64, notionToken);
        if (currentUpload.error) continue;

        const currentImageBlock = {
          object: 'block',
          type: 'image',
          image: { type: 'file_upload', file_upload: { id: currentUpload.id } }
        };

        await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', headers, body: JSON.stringify({ children: [currentImageBlock] }) });
    }

    return Response.json({ success: true, pageId: pageId });
  } catch (err) {
    console.error('Error processing batch request:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}