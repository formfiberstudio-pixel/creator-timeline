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
    // 1. Query Primary Activity Log Database
    const activityRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 1000 }),
    });
    const activityData = await activityRes.json();

    if (activityData.object === 'error') {
      return res.status(400).json({ success: false, error: activityData.message });
    }

    // 2. Query Optional Special Days Database (Failsafe)
    let specialDaysData = null;
    const cleanSpecialDbId = typeof specialDaysDatabaseId === 'string' ? specialDaysDatabaseId.trim() : '';

    if (cleanSpecialDbId) {
      try {
        const specialRes = await fetch(`https://api.notion.com/v1/databases/${cleanSpecialDbId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page_size: 1000 }),
        });
        const parsed = await specialRes.json();
        if (parsed.object !== 'error') {
          specialDaysData = parsed;
        }
      } catch (e) {
        console.warn('Special Days DB query skipped:', e);
      }
    }

    // --- HELPER: Extract Date string across Date, Formula, or Created Time properties ---
    const extractDateString = (props, page) => {
      const dateKeys = ['Log Date', 'Post-Date', 'Date', 'LogDate', 'Created time'];
      
      for (const key of dateKeys) {
        const prop = props[key];
        if (!prop) continue;

        // Formula Date (Notion API returns formula.date.start for date formulas)
        if (prop.type === 'formula' && prop.formula) {
          if (prop.formula.type === 'date' && prop.formula.date?.start) return prop.formula.date.start;
          if (prop.formula.type === 'string' && prop.formula.string) return prop.formula.string;
        }
        // Standard Date Property
        if (prop.type === 'date' && prop.date?.start) return prop.date.start;
        // Created Time Property
        if (prop.type === 'created_time' && prop.created_time) return prop.created_time;
      }

      // Generic scan across all properties if named keys fail
      for (const prop of Object.values(props)) {
        if (prop.type === 'date' && prop.date?.start) return prop.date.start;
        if (prop.type === 'formula' && prop.formula) {
          if (prop.formula.type === 'date' && prop.formula.date?.start) return prop.formula.date.start;
          if (prop.formula.type === 'string' && prop.formula.string) return prop.formula.string;
        }
      }

      // Ultimate Fallback: Notion Page Created Time (Ensures no log entry ever gets omitted)
      return page.created_time || null;
    };

    // --- HELPER: Extract Title string ---
    const extractTitle = (props) => {
      for (const key of ['Log', 'Name', 'Title', 'Entry', 'Activity']) {
        if (props[key]?.title) {
          const text = props[key].title.map((t) => t.plain_text).join('');
          if (text) return text;
        }
      }
      // Scan for any title property in schema
      const titleProp = Object.values(props).find((p) => p.type === 'title');
      if (titleProp?.title) {
        const text = titleProp.title.map((t) => t.plain_text).join('');
        if (text) return text;
      }
      return 'Untitled Entry';
    };

    // --- HELPER: Extract Property Text (Select / Multi-Select / Status / Relation) ---
    const extractPropValue = (props, possibleKeys, fallback = 'General') => {
      for (const key of possibleKeys) {
        const prop = props[key];
        if (!prop) continue;

        if (prop.type === 'select' && prop.select?.name) return prop.select.name;
        if (prop.type === 'multi_select' && prop.multi_select?.[0]?.name) return prop.multi_select[0].name;
        if (prop.type === 'status' && prop.status?.name) return prop.status.name;
        if (prop.type === 'rich_text' && prop.rich_text?.[0]?.plain_text) return prop.rich_text[0].plain_text;
        if (prop.type === 'relation' && prop.relation?.[0]?.id) return 'Project Entry';
      }
      return fallback;
    };

    // --- HELPER: Extract Notion Select Color ---
    const extractPropColor = (props, possibleKeys, fallback = 'default') => {
      for (const key of possibleKeys) {
        const prop = props[key];
        if (!prop) continue;
        if (prop.type === 'select' && prop.select?.color) return prop.select.color;
        if (prop.type === 'status' && prop.status?.color) return prop.status.color;
      }
      return fallback;
    };

    // 3. Process Activity Log Entries
    const processedLogs = (activityData.results || []).map((page) => {
      const props = page.properties;

      const title = extractTitle(props);
      const rawDateStr = extractDateString(props, page);

      let year = null, monthNumber = null, dayNumber = null;
      if (rawDateStr) {
        const [y, m, d] = rawDateStr.split('T')[0].split('-').map(Number);
        year = y;
        monthNumber = m;
        dayNumber = d;
      }

      const projectSelect = extractPropValue(props, ['Projects', 'Project', 'Category'], 'General');
      const projectType = extractPropValue(props, ['Project Type', 'Type', 'Group'], 'General');
      const projectTypeColor = extractPropColor(props, ['Project Type', 'Type', 'Group'], 'default');

      // Page Content
      const contentProp = props.Content?.rich_text || props.Notes?.rich_text || props.Description?.rich_text || [];
      const pageContent = contentProp.map((t) => t.plain_text).join('') || '';

      // Image / Cover
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

      const rawDate = props.Date?.date?.start || props.Date?.formula?.date?.start || null;
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