async function uploadImageToNotion(base64Str, notionToken, index = 0) {
  try {
    const fileName = `photo_${index + 1}.jpg`;
    const buffer = Buffer.from(base64Str, 'base64');

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    };

    // 1. Request File Upload Object from Notion
    const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: fileName, content_type: 'image/jpeg' }),
    });
    const createData = await createRes.json();

    if (!createData.id) return null;

    // 2. Upload Binary Image Data
    const targetUrl = createData.upload_url || `https://api.notion.com/v1/file_uploads/${createData.id}/send`;
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, fileName);

    await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2026-03-11',
      },
      body: formData,
    });

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

  // Safeguard: Check for required payload fields
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
    // Normalize single vs array image payloads
    const rawImages = imagesBase64 || imageBase64;
    const imageList = Array.isArray(rawImages) ? rawImages : (rawImages ? [rawImages] : []);

    // 1. Concurrently Upload All Shared Images to Notion Storage
    const uploadPromises = imageList.map((imgStr, idx) => 
      uploadImageToNotion(imgStr, notionToken, idx)
    );
    const uploadedFileIds = (await Promise.all(uploadPromises)).filter(Boolean);

    // 2. Build Database Page Properties Matched to Your Exact Notion Schema
    const entryDate = dateTaken ? new Date(dateTaken).toISOString() : new Date().toISOString();
    
    const properties = {
      // Primary Title Column (Matched to your 'Name' column)
      Name: { 
        title: [{ text: { content: title } }] 
      },
      // Photo Capture Date Column (Matched to your 'Post-Date' column)
      'Post-Date': { 
        date: { start: entryDate } 
      },
    };

    // Geolocation Column (Matched to your 'Place' property)
    if (location) {
      properties['Place'] = { 
        rich_text: [{ text: { content: location } }] 
      };
    }

    // 3. Build Image Blocks for the Page Content Body
    const children = uploadedFileIds.map((fileId) => ({
      object: 'block',
      type: 'image',
      image: {
        type: 'file_upload',
        file_upload: { id: fileId },
      },
    }));

    // 4. Assemble Page Payload
    const pagePayload = {
      parent: { database_id: databaseId },
      properties,
      children,
    };

    // Set the 1st uploaded photo as the Page Cover Art
    if (uploadedFileIds.length > 0) {
      pagePayload.cover = {
        type: 'file_upload',
        file_upload: { id: uploadedFileIds[0] },
      };
    }

    // 5. Create Page in Notion
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