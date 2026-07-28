import formidable from 'formidable';
import fs from 'fs';
import { Client } from '@notionhq/client';

// Disable Vercel's default parser so we can process form-data
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

  const form = formidable({});

  try {
    // Parse the incoming request from HTTP Shortcuts
    const [fields, files] = await form.parse(req);

    // Extract your text variables 
    const title = fields.title?.[0] || 'Android Photo Log';
    const dateTaken = fields.dateTaken?.[0] || new Date().toISOString();
    const latitude = fields.latitude?.[0] || '';
    const longitude = fields.longitude?.[0] || '';
    const location = fields.location?.[0] || '';
    const pageId = fields.pageId?.[0] || '';

// Grab the first file uploaded, regardless of the parameter name HTTP Shortcuts used
    const allFiles = Object.values(files).flat();
    const imageFile = allFiles[0];

    if (!imageFile) {
      // If it still fails, spit out exactly what Vercel received so we can debug it
      return res.status(400).json({ 
        error: 'No image provided', 
        fileParametersReceived: Object.keys(files),
        textParametersReceived: Object.keys(fields)
      });
    }

    // Convert the raw Android file into a Base64 string identically to your iOS shortcut
    const base64Data = fs.readFileSync(imageFile.filepath, { encoding: 'base64' });
    const imageBase64 = `data:${imageFile.mimetype};base64,${base64Data}`;

    // ==========================================
    // PASTE YOUR EXISTING NOTION LOGIC HERE
    // Grab the code from your original file that takes `imageBase64`, 
    // converts it to a buffer, gets the file ID, and creates the blocks!
    // ==========================================

    res.status(200).json({ success: true, message: 'Android log successfully added!' });
  } catch (error) {
    console.error('Error parsing Android form data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}