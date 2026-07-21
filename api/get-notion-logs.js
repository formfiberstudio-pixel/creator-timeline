export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { notionToken, databaseId } = req.body;

  if (!notionToken || !databaseId) {
    return res.status(400).json({ error: 'Missing notionToken or databaseId' });
  }

  try {
    // 1. Bypass the buggy Notion SDK and use a native HTTP request
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

    // 2. The Data Parser: Format raw Notion data into our flat React structure
    const formattedLogs = rawData.results.map((page) => {
      const props = page.properties;
      
      const dateProp = Object.values(props).find(p => p.type === 'date');
      const titleProp = Object.values(props).find(p => p.type === 'title');
      const textProp = Object.values(props).find(p => p.type === 'rich_text');

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
      
      let imageUrl = null;
      if (page.cover?.type === 'external') imageUrl = page.cover.external.url;
      else if (page.cover?.type === 'file') imageUrl = page.cover.file.url;

      const selectProps = Object.values(props).filter(p => p.type === 'select');
      const projectProp = props['Projects'] || props['Project'];
      const typeProp = props['Project Type'] || props['Category'] || props['Type'];

      let projectName = 'General';
      if (projectProp?.type === 'select') projectName = projectProp.select?.name || 'General';
      else if (selectProps.length > 0) projectName = selectProps[0].select?.name || 'General';

      let typeName = 'Log';
      let typeColor = 'default';
      if (typeProp?.type === 'select') {
        typeName = typeProp.select?.name || 'Log';
        typeColor = typeProp.select?.color || 'default';
      } else if (selectProps.length > 1) {
        typeName = selectProps[1].select?.name || 'Log';
        typeColor = selectProps[1].select?.color || 'default';
      }

      return {
        id: page.id,
        year,
        monthNumber,
        dayNumber,
        title: titleProp?.title?.[0]?.plain_text || 'Untitled Log',
        Projects: projectName,
        projectType: typeName,
        projectTypeColor: typeColor,
        imageUrl: imageUrl,
        pageContent: textProp?.rich_text?.[0]?.plain_text || ''
      };
    });

    // 3. Send clean data to frontend
    return res.status(200).json({ success: true, data: formattedLogs });

  } catch (error) {
    console.error('Notion API Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}