async function uploadImageToNotion(base64Str, notionToken, index = 0) {
  try {
    const fileName = `photo_${index + 1}.jpg`;
    const buffer = Buffer.from(base64Str, 'base64');

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    };

    // 1. Create File Upload Object
    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: fileName, content_type: 'image/jpeg' }),
    });
    const createData = await createRes.json();

    if (!createData.id) return null;

    // 2. Upload Binary Image Buffer
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

    if (!uploadRes.ok) return null;

    return createData.id;
  } catch (err) {
    console.warn(`[Diagnostic] Failed to upload image ${index + 1}:`, err);
    return null;
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
    // Normalize array vs string input payloads
    let imageList = [];
    if (Array.isArray(imagesBase64)) {
      imageList = imagesBase64;
    } else if (typeof imagesBase64 === 'string' && imagesBase64.length > 0) {
      imageList = imagesBase64.includes(',') ? imagesBase64.split(',') : [imagesBase64];
    } else if (imageBase64) {
      imageList = [imageBase64];
    }

    imageList = imageList.map(str => typeof str === 'string' ? str.trim() : str).filter(Boolean);

    // 1. Upload All Images
    const uploadPromises = imageList.map((imgStr, idx) => 
      uploadImageToNotion(imgStr, notionToken, idx)
    );
    const uploadedFileIds = (await Promise.all(uploadPromises)).filter(Boolean);

    // 2. Safe Date Parsing
    let validIsoDate = new Date().toISOString();
    if (dateTaken) {
      const parsedDate = new Date(dateTaken);
      if (!isNaN(parsedDate.getTime())) {
        validIsoDate = parsedDate.toISOString();
      }
    }

    // 3. Build Properties Matched to Your Notion Column Types
    const properties = {
      Name: { 
        title: [{ text: { content: title } }] 
      },
      'Post-Date': { 
        date: { start: validIsoDate } 
      },
    };

    // Set Native Notion Place Property (📍)
    if (location && String(location).trim() !== '') {
      properties['Place'] = { 
        place: { name: String(location).trim() } 
      };
    }

    // 4. Build Block Children for Page Body (Inserts ALL uploaded photos)
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

    // Set 1st Photo as Page Cover Art
    if (uploadedFileIds.length > 0) {
      pagePayload.cover = {
        type: 'file_upload',
        file_upload: { id: uploadedFileIds[0] },
      };
    }

    // 6. Send to Notion API
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify(pagePayload),
    });

    const data = await response.json();

    if (data.object === 'error') {
      return res.status(400).json({ success: false, error: data.message });
    }

    return res.status(200).json({ 
      success: true, 
      pageId: data.id, 
      uploadedPhotosCount: uploadedFileIds.length 
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}