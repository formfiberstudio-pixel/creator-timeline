export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { notionToken, databaseId, specialDaysDatabaseId } = req.body;

  if (!notionToken || !databaseId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required Notion integration token or primary database ID.' 
    });
  }

  const headers = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Prepare API request promises for parallel fetching
    const activityLogPromise = fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 1000 }),
    }).then((r) => r.json());

    const specialDaysPromise = specialDaysDatabaseId
      ? fetch(`https://api.notion.com/v1/databases/${specialDaysDatabaseId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page_size: 1000 }),
        }).then((r) => r.json())
      : Promise.resolve(null);

    // 2. Execute both queries concurrently
    const [activityData, specialDaysData] = await Promise.all([
      activityLogPromise,
      specialDaysPromise,
    ]);

    if (activityData.object === 'error') {
      return res.status(400).json({ success: false, error: activityData.message });
    }

    if (specialDaysData && specialDaysData.object === 'error') {
      return res.status(400).json({ 
        success: false, 
        error: `Special Days DB Error: ${specialDaysData.message}` 
      });
    }

    // 3. Process Activity Log Entries
    const processedLogs = (activityData.results || []).map((page) => {
      const props = page.properties;

      const titleObj = props.Log?.title || props.Name?.title || props.Title?.title || [];
      const title = titleObj.map((t) => t.plain_text).join('') || 'Untitled Entry';

      let rawDateStr = null;
      if (props['Log Date']?.formula?.string) {
        rawDateStr = props['Log Date'].formula.string;
      } else if (props['Post-Date']?.date?.start) {
        rawDateStr = props['Post-Date'].date.start;
      } else if (props.Date?.date?.start) {
        rawDateStr = props.Date.date.start;
      }

      let year = null, monthNumber = null, dayNumber = null;
      if (rawDateStr) {
        const [y, m, d] = rawDateStr.split('T')[0].split('-').map(Number);
        year = y;
        monthNumber = m;
        dayNumber = d;
      }

      const projectSelect = props.Projects?.select?.name || props.Project?.select?.name || 'General';
      const projectType = props['Project Type']?.select?.name || props.Type?.select?.name || 'General';
      const projectTypeColor = props['Project Type']?.select?.color || props.Type?.select?.color || 'default';

      const contentProp = props.Content?.rich_text || props.Notes?.rich_text || [];
      const pageContent = contentProp.map((t) => t.plain_text).join('') || '';

      let imageUrl = null;
      if (page.cover) {
        imageUrl = page.cover.type === 'external' ? page.cover.external.url : page.cover.file?.url;
      } else if (props.Image?.files?.[0]) {
        const fileObj = props.Image.files[0];
        imageUrl = fileObj.type === 'external' ? fileObj.external.url : fileObj.file?.url;
      }

      return {
        id: page.id,
        title,
        year,
        monthNumber,
        dayNumber,
        dateStr: rawDateStr ? rawDateStr.split('T')[0] : null,
        Projects: projectSelect,
        projectType,
        projectTypeColor,
        pageContent,
        imageUrl,
        url: page.url,
      };
    });

    // 4. Process Special Days (Birthdays, Holidays, Weddings, Vacations)
    const processedSpecialDays = (specialDaysData?.results || []).map((page) => {
      const props = page.properties;

      const nameObj = props.Name?.title || props.Title?.title || props.Event?.title || [];
      const name = nameObj.map((t) => t.plain_text).join('') || 'Special Day';

      const rawDate = props.Date?.date?.start || null;
      let year = null, monthNumber = null, dayNumber = null;

      if (rawDate) {
        const [y, m, d] = rawDate.split('T')[0].split('-').map(Number);
        year = y;
        monthNumber = m;
        dayNumber = d;
      }

      const occurrenceSelect = props.Occurrence?.select?.name || props.Occurrence?.status?.name || 'Once';
      const isAnnual = occurrenceSelect.toLowerCase().includes('annual');

      return {
        id: page.id,
        name,
        dateStr: rawDate ? rawDate.split('T')[0] : null,
        year,
        monthNumber,
        dayNumber,
        occurrence: isAnnual ? 'Annual' : 'Once',
      };
    });

    return res.status(200).json({
      success: true,
      data: processedLogs,
      specialDays: processedSpecialDays,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error communicating with Notion API.',
    });
  }
}