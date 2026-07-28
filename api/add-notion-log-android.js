import { Client } from '@notionhq/client';

// Disable Vercel's default JSON parser so we can read the raw binary stream natively
export const config = {
  api: {
    bodyParser: false,
  },
};

const notion = new Client({ auth: process.env.NOTION_TOKEN }); 

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Extract your text variables from the URL Query instead of a form body
    const title = req.query.title || 'Android Photo Log';
    const dateTaken = req.query.dateTaken || new Date().toISOString();
    const latitude = req.query.lat || '';
    const longitude = req.query.lon || '';
    const location = req.query.loc || '';
    const pageId = req.query.pageId || '';

    // 2. Read the raw binary file data directly from the HTTP request stream
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: 'No image data received in the request body.' });
    }

    // 3. Convert the raw buffer straight into a Base64 string identically to your iOS shortcut
    const base64Data = fileBuffer.toString('base64');
    const imageBase64 = `data:image/jpeg;base64,${base64Data}`;

    // ==========================================
    // PASTE YOUR EXISTING NOTION LOGIC HERE
    // ==========================================

    res.status(200).json({ success: true, message: 'Android log successfully added!' });
  } catch (error) {
    console.error('Error processing raw Android upload:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}