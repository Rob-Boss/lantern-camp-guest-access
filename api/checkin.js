import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory name for bundled file lookup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cabinsPath = path.join(__dirname, 'config', 'cabins.json');
const cabins = JSON.parse(fs.readFileSync(cabinsPath, 'utf8'));

const SPREADSHEET_FILE_ID = "1u6W61FoL9Ux3ZfzvBHGsTV9LyI0sPhu6";

function getGoogleCreds() {
  // Try reading local file in root directory of project
  const localPath = path.join(process.cwd(), 'token.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  // Try environment variable (for Vercel production deployment)
  if (process.env.GOOGLE_TOKEN_JSON) {
    return JSON.parse(process.env.GOOGLE_TOKEN_JSON);
  }
  throw new Error("Missing Google OAuth credentials (token.json or GOOGLE_TOKEN_JSON environment variable).");
}

async function appendRowToDrive(creds, rowData) {
  let accessToken = creds.token;
  
  // Refresh Google access token
  const refreshRes = await fetch(creds.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  
  if (refreshRes.ok) {
    const refreshData = await refreshRes.json();
    accessToken = refreshData.access_token;
  } else {
    console.error("Failed to refresh Google OAuth token:", await refreshRes.text());
  }

  // Fetch current CSV contents from Google Drive
  const getUrl = `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_FILE_ID}?alt=media`;
  const getRes = await fetch(getUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`Failed to retrieve current CSV content from Google Drive: ${errText}`);
  }

  let currentContent = await getRes.text();
  // If the file is completely empty, initialize it with the header row
  if (!currentContent || currentContent.trim() === '') {
    currentContent = "Timestamp,Token,Cabin,Email,Agreed,OptIn,Name,BookingID,CheckInDate,CheckOutDate\n";
  }

  // Format row fields for CSV safety (escaping quotes and commas)
  const cleanData = rowData.map(val => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  });
  const newRow = cleanData.join(',') + '\n';
  const updatedContent = currentContent.endsWith('\n') ? currentContent + newRow : currentContent + '\n' + newRow;

  // Upload updated CSV contents back to Google Drive
  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${SPREADSHEET_FILE_ID}?uploadType=media`;
  const updateRes = await fetch(uploadUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'text/csv'
    },
    body: updatedContent
  });

  if (!updateRes.ok) {
    throw new Error(`Failed to update waiver CSV on Google Drive: ${await updateRes.text()}`);
  }
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { token } = req.query;
    let body = {};
    if (req.method === 'POST') {
      body = req.body || {};
    }
    
    const activeToken = token || body.token;
    
    if (!activeToken) {
      return res.status(400).json({ error: 'Missing required parameter "token".' });
    }

    const cabinInfo = cabins[activeToken];
    if (!cabinInfo) {
      return res.status(404).json({ error: 'Invalid check-in token.' });
    }

    // GET Request: Retrieve cabin details without revealing door code
    if (req.method === 'GET') {
      return res.status(200).json({
        cabinName: cabinInfo.cabinName,
        type: cabinInfo.type
      });
    }

    // POST Request: Agree to waiver, save details, and return door code
    if (req.method === 'POST') {
      const { email, optIn, name, booking, checkin, checkout } = body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email address is required to check in.' });
      }

      // Capture check-in timestamp (UTC format)
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // Append signature details to Google Drive CSV
      const creds = getGoogleCreds();
      await appendRowToDrive(creds, [
        timestamp,
        activeToken,
        cabinInfo.cabinName,
        email,
        'TRUE',
        optIn ? 'TRUE' : 'FALSE',
        name || '',
        booking || '',
        checkin || '',
        checkout || ''
      ]);

      // Return the cabin door code
      return res.status(200).json({
        success: true,
        cabinName: cabinInfo.cabinName,
        doorCode: cabinInfo.doorCode,
        message: 'Waiver agreed and door code unlocked.'
      });
    }

    return res.status(405).json({ error: 'Method not allowed.' });

  } catch (error) {
    console.error('Error handling check-in:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
