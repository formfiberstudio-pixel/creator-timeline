async function uploadImageToNotion(rawInput, notionToken, index = 0) {
  try {
    if (!rawInput) return { id: null, error: `Image ${index + 1} is empty` };

    // Handle nested arrays/objects if passed from Shortcuts
    let targetStr = rawInput;
    if (Array.isArray(targetStr)) targetStr = targetStr[0];
    if (typeof targetStr === 'object' && targetStr !== null) {
      targetStr = targetStr.text || targetStr.content || JSON.stringify(targetStr);
    }

    const base64Str = String(targetStr || '');
    const cleanBase64 = base64Str.replace(/[\r\n\s]/g, '');

    if (!cleanBase64 || cleanBase64 === '[objectObject]') {
      return { id: null, error: `Image ${index + 1} is empty` };
    }

    // Auto-detect PNG (transparent cutouts/screenshots) vs JPEG
    const isPng = cleanBase64.startsWith('iVBORw');
    const contentType = isPng ? 'image/png' : 'image/jpeg';
    const fileExt = isPng ? 'png' : 'jpg';
    const fileName = `photo_${index + 1}.${fileExt}`;

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

    if (!createData.id) {
      return { 
        id: null, 
        error: `Create File Failed (${index + 1}): ${createData.message || JSON.stringify(createData)}` 
      };
    }

    // 2. Upload Binary Buffer
    const targetUrl = createData.upload_url || `https://api.notion.com/v1/file_uploads/${createData.id}/send`;
    const blob = new Blob([buffer], { type: contentType });
    const formData = new FormData();
    formData.append('file', blob, fileName);

    const uploadRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2026-03-11',
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return { id: null, error: `Binary Send Failed (${index + 1}): ${errText}` };
    }

    return { id: createData.id, error: null };
  } catch (err) {
    return { id: null, error: `Exception (${index + 1}): ${err.message}` };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const { notionToken, databaseId, title, dateTaken, location, imagesBase64, imageBase64 } = body || {};

    if (!notionToken || !databaseId || !title) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields (notionToken, databaseId, or title).' 
      });
    }

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    };

    // Normalize and recursively flatten any nested arrays from Shortcuts
    let rawData = imagesBase64 || imageBase64 || [];
    let imageList = [];

    if (Array.isArray(rawData)) {
      imageList = rawData.flat(Infinity);
    } else if (typeof rawData === 'string' && rawData.trim().length > 0) {
      const str = rawData.trim();
      if (str.startsWith('[') && str.endsWith(']')) {
        try { imageList = JSON.parse(str).flat(Infinity); } catch (e) { imageList = [str]; }
      } else {
        imageList = str.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
      }
    }

    imageList = imageList.filter(item => item !== null && item !== undefined && item !== '');

    // 1. Upload All Shared Images
    const uploadResults = await Promise.all(
      imageList.map((imgItem, idx) => uploadImageToNotion(imgItem, notionToken, idx))
    );

    const uploadedFileIds = uploadResults.map(r => r.id).filter(Boolean);
    const uploadErrors = uploadResults.map(r => r.error).filter(Boolean);

    // 2. Safe Date Parsing
    let validIsoDate = new Date().toISOString();
    if (dateTaken) {
      const parsedDate = new Date(dateTaken);
      if (!isNaN(parsedDate.getTime())) {
        validIsoDate = parsedDate.toISOString();
      }
    }

    // 3. Build Database Properties
    const properties = {
      Name: { 
        title: [{ text: { content: String(title) } }] 
      },
      'Post-Date': { 
        date: { start: validIsoDate } 
      },
    };

    if (location && String(location).trim() !== '') {
      properties['Place'] = { 
        place: { name: String(location).trim() } 
      };
    }

    // 4. Build Block Children
    const children = uploadedFileIds.map((fileId) => ({
      object: 'block',
      type: 'image',
      image: {
        type: 'file_upload',
        file_upload: { id: fileId },
      },
    }));

    // 5. Assemble Payload
    const pagePayload = {
      parent: { database_id: databaseId },
      properties,
      children,
    };

    if (uploadedFileIds.length > 0) {
      pagePayload.cover = {
        type: 'file_upload',
        file_upload: { id: uploadedFileIds[0] },
      };
    }

    // 6. Create Page in Notion
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify(pagePayload),
    });

    const data = await response.json();

    if (data.object === 'error') {
      return res.status(400).json({ success: false, error: data.message, uploadErrors });
    }

    return res.status(200).json({ 
      success: true, 
      pageId: data.id, 
      uploadedPhotosCount: uploadedFileIds.length,
      receivedImagesCount: imageList.length,
      uploadErrors: uploadErrors.length > 0 ? uploadErrors : undefined
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Internal Server Exception' });
  }
}