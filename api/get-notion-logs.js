export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const { notionToken, databaseId } = req.body;

  if (!notionToken || !databaseId) {
    return res.status(400).json({ success: false, error: 'Missing Notion Token or Database ID.' });
  }

  try {
    // 2. Query the main database for the page properties
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      // You can add sorts/filters here if you want to limit the payload
      body: JSON.stringify({
        sorts: [
          { timestamp: 'created_time', direction: 'descending' }
        ]
      })
    });

    if (!dbResponse.ok) {
      const errorData = await dbResponse.json();
      throw new Error(errorData.message || 'Failed to query Notion database.');
    }

    const dbData = await dbResponse.json();

    // 3. Map through the results and fetch the inner blocks (paragraphs) for each page
    const logs = await Promise.all(dbData.results.map(async (page) => {
      
      // --- PROPERTY EXTRACTION ---
      // Adjust the property keys below (e.g., 'Name', 'Projects', 'Date') 
      // if they differ from your exact Notion database column names.
      const title = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
      
      // Handle either Select or Multi-Select for Projects
      const projectsProp = page.properties.Projects;
      const projectsName = projectsProp?.select?.name 
        || projectsProp?.multi_select?.[0]?.name 
        || 'Untitled Project';

      // Type and Color
      const projectTypeProp = page.properties['Project Type'] || page.properties.Type;
      const projectType = projectTypeProp?.select?.name || 'General';
      const projectTypeColor = projectTypeProp?.select?.color || 'default';

      // Parse the Date column into year, month, and day for the frontend calendar
      const dateStr = page.properties.Date?.date?.start;
      let year, monthNumber, dayNumber;
      if (dateStr) {
        const [y, m, d] = dateStr.split('-');
        year = parseInt(y, 10);
        monthNumber = parseInt(m, 10); // Note: 1-12 format
        dayNumber = parseInt(d, 10);
      }

      // Extract Cover Image
      const imageUrl = page.cover?.external?.url || page.cover?.file?.url || null;

      // --- PAGE BLOCKS EXTRACTION ---
      let pageContent = '';
      try {
        const blocksResponse = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28'
          }
        });
        
        if (blocksResponse.ok) {
          const blocksData = await blocksResponse.json();
          
          // Filter for paragraphs, extract the text, and join with double line breaks
          pageContent = (blocksData.results || [])
            .filter(block => block.type === 'paragraph' && block.paragraph.rich_text.length > 0)
            .map(block => block.paragraph.rich_text.map(textChunk => textChunk.plain_text).join(''))
            .join('\n\n');
        }
      } catch (blockErr) {
        console.error(`Failed to fetch blocks for page ${page.id}:`, blockErr);
        // Fail silently for individual block errors so the rest of the widget still loads
      }

      // Return the compiled log object to the frontend
      return {
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
      };
    }));

    // 4. Send the enriched logs array back to the React app
    return res.status(200).json({ success: true, data: logs });

  } catch (error) {
    console.error('Notion API Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error.' });
  }
}