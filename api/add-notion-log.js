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

    // 1. Request Upload Object from Notion
    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: fileName, content_type: contentType }),
    });
    const createData = await createRes.json();
    if (!createData.id) return { id: null, error: createData.message };

    // 2. Upload Binary Buffer
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
    let body = req.body;
    if (typeof body === 'string') try { body = JSON.parse(body); } catch (e) {}

    // Notice we are now accepting 'pageId' and a singular 'imageBase64'
    const { notionToken, databaseId, title, dateTaken, location, imageBase64, pageId } = body || {};

    if (!notionToken || !imageBase64) {
      return res.status(400).json({ error: 'Missing token or image data.' });
    }

    // 1. Upload the single image to Notion's servers
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

    // 2. IF PAGE ID EXISTS -> Append image to existing page
    if (pageId && String(pageId).trim() !== '') {
      const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ children: [imageBlock] })
      });
      const appendData = await appendRes.json();
      if (appendData.object === 'error') return res.status(400).json({ error: appendData.message });
      
      return res.status(200).json({ success: true, pageId: pageId });
    }

    // 3. IF NO PAGE ID -> Create a brand new page (For the very first photo)
    let validIsoDate = new Date().toISOString();
    if (dateTaken && !isNaN(new Date(dateTaken).getTime())) validIsoDate = new Date(dateTaken).toISOString();

    const properties = {
      Name: { title: [{ text: { content: String(title) } }] },
      'Post-Date': { date: { start: validIsoDate } },
    };

    if (location && String(location).trim() !== '') {
      properties['Place'] = { place: { name: String(location).trim() } };
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
    return res.status(500).json({ error: err.message });
  }
}