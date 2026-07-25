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
    // 1. Fetch Primary Activity Log Database
    const activityRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 100 }), // Notion API max limit is 100
    });
    const activityData = await activityRes.json();

    if (activityData.object === 'error') {
      return res.status(400).json({ success: false, error: activityData.message });
    }

    // 2. Fetch Optional Special Days Database (Failsafed)
    let specialDaysData = null;
    const cleanSpecialDbId = typeof specialDaysDatabaseId === 'string' ? specialDaysDatabaseId.trim() : '';

    if (cleanSpecialDbId) {
      try {
        const specialRes = await fetch(`https://api.notion.com/v1/databases/${cleanSpecialDbId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page_size: 100 }),
        });
        const parsed = await specialRes.json();
        if (parsed.object !== 'error') {
          specialDaysData = parsed;
        }
      } catch (e) {
        console.warn('Special Days DB query skipped:', e);
      }
    }

    // 3. Process Primary Activity Log Entries (Reverted to exact original mapping)
    const processedLogs = (activityData.results || []).map((page) => {
      const props = page.properties;

      // Title
      const titleObj = props.Log?.title || props.Name?.title || props.Title?.title || [];
      const title = titleObj.map((t) => t.plain_text).join('') || 'Untitled Entry';

      // Date (With added fix for Formula Date objects & Fallback to created time)
      let rawDateStr = null;
      if (props['Log Date']?.formula?.string) {
        rawDateStr = props['Log Date'].formula.string;
      } else if (props['Log Date']?.formula?.date?.start) {
        rawDateStr = props['Log Date'].formula.date.start;
      } else if (props['Post-Date']?.date?.start) {
        rawDateStr = props['Post-Date'].date.start;
      } else if (props.Date?.date?.start) {
        rawDateStr = props.Date.date.start;
      } else {
        rawDateStr = page.created_time;
      }

      let year = null, monthNumber = null, dayNumber = null;
      if (rawDateStr) {
        const [y, m, d] = rawDateStr.split('T')[0].split('-').map(Number);
        year = y;
        monthNumber = m;
        dayNumber = d;
      }

      // Projects & Category Tags
      const projectSelect = props.Projects?.select?.name || props.Project?.select?.name || 'General';
      const projectType = props['Project Type']?.select?.name || props.Type?.select?.name || 'General';
      const projectTypeColor = props['Project Type']?.select?.color || props.Type?.select?.color || 'default';

      // Text Content (Retained full paragraph map/join)
      const contentProp = props.Content?.rich_text || props.Notes?.rich_text || [];
      const pageContent = contentProp.map((t) => t.plain_text).join('') || '';

      // Image / Cover Art
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

    // 4. Process Optional Special Days
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