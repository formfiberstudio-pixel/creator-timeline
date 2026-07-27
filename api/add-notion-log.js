export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { notionToken, databaseId, title, dateTaken, location, uploadedFileIds } = req.body;

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
    // 1. Safe Date Parsing
    let validIsoDate = new Date().toISOString();
    if (dateTaken) {
      const parsedDate = new Date(dateTaken);
      if (!isNaN(parsedDate.getTime())) {
        validIsoDate = parsedDate.toISOString();
      }
    }

    // 2. Build Properties
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

    // 3. Normalize File IDs Array
    const fileIds = Array.isArray(uploadedFileIds) ? uploadedFileIds : (uploadedFileIds ? [uploadedFileIds] : []);

    // 4. Build Block Children for Page Body
    const children = fileIds.map((fileId) => ({
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

    // Set 1st Photo as Page Cover
    if (fileIds.length > 0) {
      pagePayload.cover = {
        type: 'file_upload',
        file_upload: { id: fileIds[0] },
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
      return res.status(400).json({ success: false, error: data.message });
    }

    return res.status(200).json({ 
      success: true, 
      pageId: data.id, 
      uploadedPhotosCount: fileIds.length 
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}