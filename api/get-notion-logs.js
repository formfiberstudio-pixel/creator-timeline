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
    // 1. Fetch the main log database
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: headers
    });

    if (!response.ok) {
      throw new Error('Failed to fetch from Notion database');
    }

    const rawData = await response.json();

    // 2. Deep fetch loop: concurrent extraction for relation hops and block scans
    const formattedLogs = await Promise.all(rawData.results.map(async (page) => {
      const props = page.properties;
      const propValues = Object.values(props);

      // --- DATE ---
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

      // --- TITLE ---
      const titleProp = propValues.find(p => p.type === 'title');
      const title = titleProp?.title?.[0]?.plain_text || 'Untitled Log';

      // --- PROJECT NAME (RELATION HOP) ---
      let projectName = 'General';
      const relationProp = propValues.find(p => p.type === 'relation');
      
      // If a relation is found, make a secondary API call to grab the actual name
      if (relationProp && relationProp.relation.length > 0) {
        const relatedPageId = relationProp.relation[0].id;
        try {
          const relRes = await fetch(`https://api.notion.com/v1/pages/${relatedPageId}`, { method: 'GET', headers });
          if (relRes.ok) {
            const relData = await relRes.json();
            const relTitleProp = Object.values(relData.properties).find(p => p.type === 'title');
            if (relTitleProp && relTitleProp.title.length > 0) {
              projectName = relTitleProp.title[0].plain_text;
            }
          }
        } catch (err) {
          console.warn('Failed to fetch relation name for page', page.id);
        }
      }

      // --- PROJECT TYPE (ROLLUP EXTRACTION) ---
      let typeName = 'Log';
      let typeColor = 'default';
      const rollupProp = propValues.find(p => p.type === 'rollup');
      
      if (rollupProp && rollupProp.rollup) {
        const rollupData = rollupProp.rollup;
        // Rollups return an array of the targeted properties
        if (rollupData.type === 'array' && rollupData.array.length > 0) {
          const firstItem = rollupData.array[0];
          // Support rolled-up Selects and Multi-Selects (to grab your Figma token colors)
          if (firstItem.type === 'select' && firstItem.select) {
            typeName = firstItem.select.name;
            typeColor = firstItem.select.color;
          } else if (firstItem.type === 'multi_select' && firstItem.multi_select.length > 0) {
            typeName = firstItem.multi_select[0].name;
            typeColor = firstItem.multi_select[0].color;
          } else if (firstItem.type === 'rich_text' && firstItem.rich_text.length > 0) {
            typeName = firstItem.rich_text[0].plain_text;
          }
        }
      }

      // --- DEEP FETCH PAGE BLOCKS (IMAGE & ANY TEXT) ---
      let imageUrl = null;
      let pageContent = '';

      try {
        const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=25`, {
          method: 'GET',
          headers: headers
        });
        
        if (blockRes.ok) {
          const blockData = await blockRes.json();
          
          // 1. Find the first image component
          const imgBlock = blockData.results.find(b => b.type === 'image');
          if (imgBlock) {
            imageUrl = imgBlock.image.type === 'external' ? imgBlock.image.external.url : imgBlock.image.file.url;
          }
          
          // 2. Find the first text component (Searches paragraphs, headings, quotes, lists, etc.)
          for (const b of blockData.results) {
            const blockTypeData = b[b.type];
            if (blockTypeData && blockTypeData.rich_text && blockTypeData.rich_text.length > 0) {
              pageContent = blockTypeData.rich_text.map(t => t.plain_text).join('');
              break; // Stop after grabbing the first block of text
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch page blocks for page ${page.id}`);
      }

      return {
        id: page.id,
        year,
        monthNumber,
        dayNumber,
        title,
        Projects: projectName,
        projectType: typeName,
        projectTypeColor: typeColor,
        imageUrl,
        pageContent
      };
    }));

    return res.status(200).json({ success: true, data: formattedLogs });

  } catch (error) {
    console.error('Notion API Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}