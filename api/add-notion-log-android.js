import { Client } from '@notionhq/client';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Catch the user's personal Notion credentials from the request headers
    const userNotionToken = req.headers['x-notion-token'];
    const userDatabaseId = req.headers['x-database-id'];

    if (!userNotionToken || !userDatabaseId) {
      return res.status(401).json({ error: 'Missing Notion Token or Database ID.' });
    }

    // 2. Initialize the Notion client dynamically using the customer's token
    const notion = new Client({ auth: userNotionToken }); 

    // 3. Extract the text metadata from the URL
    const title = req.query.title || 'Android Photo Log';
    const dateTaken = req.query.dateTaken || new Date().toISOString();
    const latitude = req.query.lat || '';
    const longitude = req.query.lon || '';
    const location = req.query.loc || '';
    const pageId = req.query.pageId || '';

    // 4. Read the raw binary file data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No image data received.' });
    }

    const base64Data = fileBuffer.toString('base64');
    const imageBase64 = `data:image/jpeg;base64,${base64Data}`;

    // ==========================================
    // PASTE YOUR EXISTING NOTION LOGIC HERE
    // * Ensure your Notion logic references `userDatabaseId` 
    //   instead of process.env.NOTION_DATABASE_ID!
    // ==========================================

    res.status(200).json({ success: true, message: 'Android log successfully added!' });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}