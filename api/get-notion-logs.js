export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const { notionToken, databaseId } = req.body;

  if (!notionToken || !databaseId) {
    return res.status(400).json({ success: false, error: 'Missing Notion Token or Database ID.' });
  }

  try {
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sorts: [{ timestamp: 'created_time', direction: 'descending' }]
      })
    });

    if (!dbResponse.ok) {
      const errorData = await dbResponse.json();
      throw new Error(errorData.message || 'Failed to query Notion database.');
    }

    const dbData = await dbResponse.json();
    const logs = [];

    // Use a sequential loop to avoid hitting Notion rate limits
    for (const page of dbData.results) {
      try {
        const title = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
        const projectsProp = page.properties.Projects;
        const projectsName = projectsProp?.select?.name || projectsProp?.multi_select?.[0]?.name || 'Untitled Project';

        const projectTypeProp = page.properties['Project Type'] || page.properties.Type;
        const projectType = projectTypeProp?.select?.name || 'General';
        const projectTypeColor = projectTypeProp?.select?.color || 'default';

        const dateStr = page.properties.Date?.date?.start;
        let year, monthNumber, dayNumber;
        if (dateStr) {
          const [y, m, d] = dateStr.split('-');
          year = parseInt(y, 10);
          monthNumber = parseInt(m, 10);
          dayNumber = parseInt(d, 10);
        }

        const imageUrl = page.cover?.external?.url || page.cover?.file?.url || null;

        // Fetch block children for full paragraph text
        let pageContent = '';
        const blocksResponse = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28'
          }
        });

        if (blocksResponse.ok) {
          const blocksData = await blocksResponse.json();
          pageContent = (blocksData.results || [])
            .filter(block => block.type === 'paragraph' && block.paragraph?.rich_text?.length > 0)
            .map(block => block.paragraph.rich_text.map(chunk => chunk.plain_text).join(''))
            .join('\n\n');
        }

        logs.push({
          id: page.id,
          url: page.url,
      title,
          Projects: projectsName,
          projectType,
          projectTypeColor,
          year,
          monthNumber,
          dayNumber,
          imageUrl,
          pageContent
        });
      } catch (pageErr) {
        console.error(`Skipping malformed page ${page.id}:`, pageErr);
      }
    }

    return res.status(200).json({ success: true, data: logs });

  } catch (error) {
    console.error('Notion API Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error.' });
  }
}