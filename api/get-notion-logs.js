export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { notionToken, databaseId } = req.body;

  if (!notionToken || !databaseId) {
    return res.status(400).json({ error: 'Missing notionToken or databaseId' });
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch from Notion');
    }

    const rawData = await response.json();

    const formattedLogs = rawData.results.map((page) => {
      const props = page.properties;
      const propValues = Object.values(props);

      // 1. TITLE
      const titleProp = propValues.find(p => p.type === 'title');
      const title = titleProp?.title?.[0]?.plain_text || 'Untitled Log';

      // 2. DATE
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
      
      // 3. SMART IMAGE FINDER (Checks Page Cover first, then any "Files & media" column)
      let imageUrl = null;
      if (page.cover?.type === 'external') {
        imageUrl = page.cover.external.url;
      } else if (page.cover?.type === 'file') {
        imageUrl = page.cover.file.url;
      }
      
      if (!imageUrl) {
        const filesProp = propValues.find(p => p.type === 'files' && p.files?.length > 0);
        if (filesProp) {
          const file = filesProp.files[0];
          imageUrl = file.type === 'external' ? file.external.url : file.file.url;
        }
      }

      // 4. SMART TEXT FINDER (Finds the first Text column and merges formatted text blocks)
      const textProp = propValues.find(p => p.type === 'rich_text' && p.rich_text?.length > 0);
      const pageContent = textProp ? textProp.rich_text.map(t => t.plain_text).join('') : '';

      // 5. SMART CATEGORY FINDER (Hunts for Dropdowns/Tags)
      const getSelectData = (prop) => {
        if (!prop) return null;
        if (prop.type === 'select' && prop.select) return { name: prop.select.name, color: prop.select.color };
        if (prop.type === 'multi_select' && prop.multi_select.length > 0) return { name: prop.multi_select[0].name, color: prop.multi_select[0].color };
        return null;
      };

      // Try common column names first
      let projectData = getSelectData(props['Projects'] || props['Project'] || props['Project Name'] || props['Client']);
      let typeData = getSelectData(props['Project Type'] || props['Category'] || props['Type'] || props['Tags']);

      // If typical names fail, automatically grab the first and second dropdown menus available
      const allSelects = propValues.filter(p => p.type === 'select' || p.type === 'multi_select');
      if (!projectData && allSelects.length > 0) projectData = getSelectData(allSelects[0]);
      if (!typeData && allSelects.length > 1) typeData = getSelectData(allSelects[1]);

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
    });

    return res.status(200).json({ success: true, data: formattedLogs });

  } catch (error) {
    console.error('Notion API Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}