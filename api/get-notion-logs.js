export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { notionToken, databaseId } = req.body;

  if (!notionToken || !databaseId) {
    return res.status(400).json({ error: 'Missing notionToken or databaseId' });
  }

  const headers = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  try {
    // 1. Fetch the main database rows
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: headers
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch database');
    }

    const rawData = await response.json();

    // 2. Map through rows and Deep Fetch page contents concurrently
    const formattedLogs = await Promise.all(rawData.results.map(async (page) => {
      const props = page.properties;
      const propValues = Object.values(props);

      // --- LAYER 1: DATABASE COLUMNS ---
      
      const titleProp = propValues.find(p => p.type === 'title');
      const title = titleProp?.title?.[0]?.plain_text || 'Untitled Log';

      const dateProp = propValues.find(p => p.type === 'date');
      const dateStr = dateProp?.date?.start || page.created_time.split('T')[0];
      
      let year, monthNumber, dayNumber;
      if (dateStr.includes('T')) {
         const d = new Date(dateStr);
         year = d.getFullYear();
         monthNumber = d.getMonth() + 1;
         dayNumber = d.getDate();
      } else {
         const [y, m, d] = dateStr.split('-');
         year = parseInt(y, 10);
         monthNumber = parseInt(m, 10);
         dayNumber = parseInt(d, 10);
      }

      // Look for images in the cover or file columns first
      let imageUrl = null;
      if (page.cover?.type === 'external') imageUrl = page.cover.external.url;
      else if (page.cover?.type === 'file') imageUrl = page.cover.file.url;
      
      if (!imageUrl) {
        const filesProp = propValues.find(p => p.type === 'files' && p.files?.length > 0);
        if (filesProp) {
          const file = filesProp.files[0];
          imageUrl = file.type === 'external' ? file.external.url : file.file.url;
        }
      }

      // Look for text in text columns first
      let pageContent = '';
      const textProp = propValues.find(p => p.type === 'rich_text' && p.rich_text?.length > 0);
      if (textProp) {
        pageContent = textProp.rich_text.map(t => t.plain_text).join('');
      }

      // Scan for Tags (now supports Select, Multi-Select, and Status types)
      const getTagData = (prop) => {
        if (!prop) return null;
        if (prop.type === 'select' && prop.select) return { name: prop.select.name, color: prop.select.color };
        if (prop.type === 'multi_select' && prop.multi_select.length > 0) return { name: prop.multi_select[0].name, color: prop.multi_select[0].color };
        if (prop.type === 'status' && prop.status) return { name: prop.status.name, color: prop.status.color };
        return null;
      };

      const allTags = propValues.filter(p => p.type === 'select' || p.type === 'multi_select' || p.type === 'status');
      let projectData = getTagData(props['Projects'] || props['Project']);
      let typeData = getTagData(props['Project Type'] || props['Category'] || props['Type'] || props['Status']);

      if (!projectData && allTags.length > 0) projectData = getTagData(allTags[0]);
      if (!typeData && allTags.length > 1) typeData = getTagData(allTags[1]);

      // --- LAYER 2: DEEP FETCH PAGE BLOCKS ---
      // If we didn't find an image or text in the columns, dive into the page body
      if (!imageUrl || !pageContent) {
        try {
          const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=25`, {
            method: 'GET',
            headers: headers
          });
          
          if (blockRes.ok) {
            const blockData = await blockRes.json();
            
            // Find first image block in the page
            if (!imageUrl) {
              const imgBlock = blockData.results.find(b => b.type === 'image');
              if (imgBlock) {
                imageUrl = imgBlock.image.type === 'external' ? imgBlock.image.external.url : imgBlock.image.file.url;
              }
            }
            
            // Find first paragraph block in the page
            if (!pageContent) {
              const pBlock = blockData.results.find(b => b.type === 'paragraph' && b.paragraph.rich_text.length > 0);
              if (pBlock) {
                pageContent = pBlock.paragraph.rich_text.map(t => t.plain_text).join('');
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch blocks for page ${page.id}`, err);
        }
      }

      return {
        id: page.id,
        year,
        monthNumber,
        dayNumber,
        title: title,
        Projects: projectData?.name || 'General',
        projectType: typeData?.name || 'Log',
        projectTypeColor: typeData?.color || 'default',
        imageUrl: imageUrl,
        pageContent: pageContent
      };
    }));

    return res.status(200).json({ success: true, data: formattedLogs });

  } catch (error) {
    console.error('Notion API Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}