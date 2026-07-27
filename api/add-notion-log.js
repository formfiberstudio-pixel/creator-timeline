async function uploadImageToNotion(base64Str, notionToken, index = 0) {
  try {
    const cleanBase64 = base64Str.replace(/[\r\n\s]/g, '');
    
    // Auto-detect PNG vs JPEG from Base64 header
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
      return { id: null, error: `Create File Failed (${index + 1}): ${createData.message || JSON.stringify(createData)}` };
    }

    // 2. Upload Binary Buffer
    const targetUrl = createData.upload_url || `https://api.notion.com/v1/file_uploads/${createData.id}/send`;
    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
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