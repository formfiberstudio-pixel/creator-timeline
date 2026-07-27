async function uploadImageToNotion(base64Str, notionToken, index = 0) {
  try {
    const fileName = `photo_${index + 1}.jpg`;
    // Clean any residual newlines or spaces from the Base64 string
    const cleanBase64 = base64Str.replace(/[\r\n\s]/g, '');
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
      body: JSON.stringify({ filename: fileName, content_type: 'image/jpeg' }),
    });
    const createData = await createRes.json();

    if (!createData.id) {
      return { id: null, error: `Create File Failed (${index + 1}): ${createData.message || JSON.stringify(createData)}` };
    }

    // 2. Upload Binary Buffer
    const targetUrl = createData.upload_url || `https://api.notion.com/v1/file_uploads/${createData.id}/send`;
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
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

  const { notionToken, databaseId, title, dateTaken, location, imagesBase64, imageBase64 } = req.body;

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

  try {
    // Robust parsing for Arrays, single strings, or newline-delimited lists from Shortcuts
    let imageList = [];
    const rawData = imagesBase64 || imageBase64;

    if (Array.isArray(rawData)) {
      imageList = rawData;
    } else if (typeof rawData === 'string' && rawData.trim().length > 0) {
      const str = rawData.trim();
      if (str.startsWith('[') && str.endsWith(']')) {
        try { imageList = JSON.parse(str); } catch (e) { imageList = [str]; }
      } else {
        // Handle newline or comma separated values from Shortcuts repeat results
        imageList = str.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
      }
    }

    // 1. Upload Images and Collect Detailed Statuses
    const uploadResults = await Promise.all(
      imageList.map((imgStr, idx) => uploadImageToNotion(imgStr, notionToken, idx))
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
        title: [{ text: { content: title } }] 
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
    return res.status(500).json({ success: false, error: err.message });
  }
}