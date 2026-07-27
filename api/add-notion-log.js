async function uploadImageToNotion(rawInput, notionToken, index = 0) {
  try {
    if (!rawInput) return { id: null, error: `Image ${index + 1} is empty` };

    // Safely coerce and clean the base64 string
    const base64Str = typeof rawInput === 'string' ? rawInput : String(rawInput);
    const cleanBase64 = base64Str.replace(/[\r\n\s]/g, '');

    if (!cleanBase64) return { id: null, error: `Image ${index + 1} string is empty` };

    // Auto-detect PNG (transparent cutouts) vs JPEG from Base64 magic numbers
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

    // 2. Upload Binary Buffer using FormData & Blob
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
    // Parse body safely whether sent as parsed JSON or stringified text
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

    // Normalize Array vs String vs Single payload types safely
    let imageList = [];
    const rawData = imagesBase64 || imageBase64;

    if (Array.isArray(rawData)) {
      imageList = rawData;
    } else if (typeof rawData === 'string' && rawData.trim().length > 0) {
      const str = rawData.trim();
      if (str.startsWith('[') && str.endsWith(']')) {
        try { imageList = JSON.parse(str); } catch (e) { imageList = [str]; }
      } else {
        imageList = str.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
      }
    }

    imageList = imageList.filter(item => item !== null && item !== undefined);

    // 1. Upload All Shared Images Concurrently
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

    // 4. Build Block Children for Page Body
    const children = uploadedFileIds.map((fileId) => ({
      object: 'block',
      type: 'image',
      image: {
        type: 'file_upload',
        file_upload: { id: fileId },
      },
    }));

    // 5. Assemble Page Payload
    const pagePayload = {
      parent: { database_id: databaseId },
      properties,
      children,
    };

    // Set 1st photo as page cover
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