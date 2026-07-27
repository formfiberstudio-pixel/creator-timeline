// 2. Build Database Page Properties (Matched to your Notion Schema)
    const entryDate = dateTaken ? new Date(dateTaken).toISOString() : new Date().toISOString();
    const properties = {
      // Updated to 'Name' to match your database title column!
      Name: { 
        title: [{ text: { content: title } }] 
      },
      'Post-Date': { 
        date: { start: entryDate } 
      },
    };

    // Add Location if present
    if (location) {
      properties['Location'] = { 
        rich_text: [{ text: { content: location } }] 
      };
    }