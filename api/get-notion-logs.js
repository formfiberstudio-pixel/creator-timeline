export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' }); //[cite: 2]
  }

  // Extract the dynamically passed timeZone from the frontend
  const { notionToken, databaseId, timeZone } = req.body; //[cite: 2]

  if (!notionToken || !databaseId) {
    return res.status(400).json({ error: 'Missing credentials in request' }); //[cite: 2]
  }

  // Set the dynamic timezone, falling back to UTC if not provided
  const targetTimeZone = timeZone || "UTC";

  const headers = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  }; //[cite: 2]

  try {
    console.log(`[Diagnostic] Attempting to fetch Database ID: ${databaseId}`); //[cite: 2]
    
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: headers
    }); //[cite: 2]

    if (!response.ok) {
      const errorData = await response.json(); //[cite: 2]
      console.error('[Diagnostic] Notion API Error Response:', errorData); //[cite: 2]
      throw new Error(errorData.message || 'Failed to fetch from Notion database'); //[cite: 2]
    }

    const rawData = await response.json(); //[cite: 2]
    console.log(`[Diagnostic] Successfully fetched ${rawData.results.length} rows.`); //[cite: 2]

    const formattedLogs = await Promise.all(rawData.results.map(async (page) => {
      try {
        const props = page.properties; //[cite: 2]
        const propValues = Object.values(props); //[cite: 2]

        // --- DATE SAFEGUARD ---
        const dateProp = propValues.find(p => p.type === 'date'); //[cite: 2]
        const dateStr = dateProp?.date?.start || page.created_time?.split('T')[0]; //[cite: 2]
        
        if (!dateStr) throw new Error('No valid date string found'); //[cite: 2]

        let year, monthNumber, dayNumber; //[cite: 2]
        if (dateStr.includes('T')) { //[cite: 2]
           // Force timezone to the dynamic browser timezone for timestamps crossing midnight UTC
           const localDateStr = new Date(dateStr).toLocaleString("en-US", { timeZone: targetTimeZone });
           const d = new Date(localDateStr);
           year = d.getFullYear(); //[cite: 2]
           monthNumber = d.getMonth() + 1; //[cite: 2]
           dayNumber = d.getDate(); //[cite: 2]
        } else {
           const [y, m, d] = dateStr.split('-'); //[cite: 2]
           year = parseInt(y, 10); //[cite: 2]
           monthNumber = parseInt(m, 10); //[cite: 2]
           dayNumber = parseInt(d, 10); //[cite: 2]
        }

        // --- TITLE ---
        const titleProp = propValues.find(p => p.type === 'title'); //[cite: 2]
        const title = titleProp?.title?.[0]?.plain_text || 'Untitled Log'; //[cite: 2]

        // --- RELATION SAFEGUARD ---
        let projectName = 'General'; //[cite: 2]
        const validRelations = propValues.filter(p => p.type === 'relation' && p.relation?.length > 0); //[cite: 2]
        
        if (validRelations.length > 0) {
          const relatedPageId = validRelations[0].relation[0].id; //[cite: 2]
          try {
            const relRes = await fetch(`https://api.notion.com/v1/pages/${relatedPageId}`, { method: 'GET', headers }); //[cite: 2]
            if (relRes.ok) {
              const relData = await relRes.json(); //[cite: 2]
              const relTitleProp = Object.values(relData.properties).find(p => p.type === 'title'); //[cite: 2]
              if (relTitleProp && relTitleProp.title.length > 0) {
                projectName = relTitleProp.title[0].plain_text; //[cite: 2]
              }
            } else {
               console.warn(`[Diagnostic] Relation fetch failed. Missing integration access to related DB.`); //[cite: 2]
            }
          } catch (err) {
            console.warn(`[Diagnostic] Network error fetching relation for page ${page.id}`); //[cite: 2]
          }
        }

        // --- ROLLUP SAFEGUARD ---
        let typeName = 'Log'; //[cite: 2]
        let typeColor = 'default'; //[cite: 2]
        const validRollups = propValues.filter(p => p.type === 'rollup' && p.rollup?.array?.length > 0); //[cite: 2]
        
        if (validRollups.length > 0) {
          const firstItem = validRollups[0].rollup.array[0]; //[cite: 2]
          if (firstItem.type === 'select' && firstItem.select) {
            typeName = firstItem.select.name; //[cite: 2]
            typeColor = firstItem.select.color; //[cite: 2]
          } else if (firstItem.type === 'multi_select' && firstItem.multi_select.length > 0) {
            typeName = firstItem.multi_select[0].name; //[cite: 2]
            typeColor = firstItem.multi_select[0].color; //[cite: 2]
          } else if (firstItem.type === 'title' && firstItem.title.length > 0) {
            typeName = firstItem.title[0].plain_text; //[cite: 2]
          } else if (firstItem.type === 'rich_text' && firstItem.rich_text.length > 0) {
            typeName = firstItem.rich_text[0].plain_text; //[cite: 2]
          }
        }

        // --- DEEP FETCH SAFEGUARD ---
        let imageUrl = null; //[cite: 2]
        let pageContent = ''; //[cite: 2]

        try {
          const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=25`, {
            method: 'GET',
            headers: headers
          }); //[cite: 2]
          
          if (blockRes.ok) {
            const blockData = await blockRes.json(); //[cite: 2]
            const imgBlock = blockData.results.find(b => b.type === 'image'); //[cite: 2]
            if (imgBlock) {
              imageUrl = imgBlock.image.type === 'external' ? imgBlock.image.external.url : imgBlock.image.file.url; //[cite: 2]
            }
            
            for (const b of blockData.results) {
              const blockTypeData = b[b.type]; //[cite: 2]
              if (blockTypeData && blockTypeData.rich_text && blockTypeData.rich_text.length > 0) {
                pageContent = blockTypeData.rich_text.map(t => t.plain_text).join(''); //[cite: 2]
                break;  //[cite: 2]
              }
            }
          }
        } catch (err) {
          console.warn(`[Diagnostic] Failed to fetch blocks for page ${page.id}`); //[cite: 2]
        }

        return {
          id: page.id, //[cite: 2]
          year,
          monthNumber,
          dayNumber,
          title,
          Projects: projectName, //[cite: 2]
          projectType: typeName, //[cite: 2]
          projectTypeColor: typeColor, //[cite: 2]
          imageUrl,
          pageContent
        };
      } catch (rowError) {
        console.error(`[Diagnostic] Skipped a row due to error:`, rowError.message); //[cite: 2]
        return null; //[cite: 2]
      }
    }));

    // Filter out any rows that crashed
    const validLogs = formattedLogs.filter(log => log !== null); //[cite: 2]
    console.log(`[Diagnostic] Successfully returning ${validLogs.length} valid logs to frontend.`); //[cite: 2]

    return res.status(200).json({ success: true, data: validLogs }); //[cite: 2]

  } catch (error) {
    console.error('[Diagnostic] Fatal API Error:', error.message); //[cite: 2]
    return res.status(500).json({ error: error.message }); //[cite: 2]
  }
}