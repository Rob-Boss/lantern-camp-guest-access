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
    currentContent = "Timestamp,BookingID,Cabin,Name,Email,Phone,Agreed,OptIn,CheckInDate,CheckOutDate\n";
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
    const { token, code } = req.query;
    let body = {};
    if (req.method === 'POST') {
      body = req.body || {};
    }
    
    const activeToken = token || code || body.token || body.code;
    
    let cabinInfo = cabins[activeToken];
    if (!cabinInfo) {
      // Fallback for general waiver links and Airbnb confirmation codes prior to cabin assignment
      cabinInfo = {
        cabinName: "Lantern Camp Orland",
        doorCode: "SMS",
        type: "General"
      };
    }

    // GET Request: Retrieve cabin & booking details without revealing door code
    if (req.method === 'GET') {
      let bookingDetails = null;
      const qName = req.query.name || req.query.firstname || '';
      const qCheckin = req.query.checkin || '';
      const targetCode = code || token || activeToken;

      if (targetCode || qName || qCheckin) {
        try {
          const operationsApiUrl = process.env.OPERATIONS_API_URL || 'https://operations.lanterncamp.com';
          const bRes = await fetch(`${operationsApiUrl}/api/dashboard/bookings`);
          if (bRes.ok) {
            const data = await bRes.json();
            const bookings = data.bookings || [];
            
            // 1. Try matching by ID or notes
            if (targetCode) {
              bookingDetails = bookings.find(b => 
                String(b.id) === String(targetCode) || 
                (b.notes && b.notes.toLowerCase().includes(String(targetCode).toLowerCase()))
              );
            }
            
            // 2. Fallback: Try matching by guest name & checkin date
            if (!bookingDetails && (qName || qCheckin)) {
              bookingDetails = bookings.find(b => {
                const matchName = qName ? (b.guest_name || '').toLowerCase().includes(qName.toLowerCase()) : true;
                const matchDate = qCheckin ? String(b.check_in_date) === String(qCheckin) : true;
                return matchName && matchDate;
              });
            }

            // 3. Fallback for new Airbnb codes: Match upcoming Airbnb bookings
            if (!bookingDetails && targetCode && String(targetCode).length > 5) {
              const todayStr = new Date().toISOString().split('T')[0];
              const upcomingAirbnb = bookings.filter(b => 
                b.channel && b.channel.toLowerCase().includes('airbnb') && 
                b.check_in_date >= todayStr
              );
              if (upcomingAirbnb.length === 1) {
                bookingDetails = upcomingAirbnb[0];
              }
            }
          }
        } catch (e) {
          console.error("Error looking up booking details:", e);
        }
      }

      const isSpecificCabin = cabins[activeToken] && cabins[activeToken].type !== 'General';
      const displayCabinName = isSpecificCabin ? cabins[activeToken].cabinName : cabinInfo.cabinName;

      return res.status(200).json({
        cabinName: displayCabinName,
        guestName: (bookingDetails && bookingDetails.guest_name) ? bookingDetails.guest_name : (qName || ""),
        checkinDate: (bookingDetails && bookingDetails.check_in_date) ? bookingDetails.check_in_date : (qCheckin || ""),
        checkoutDate: (bookingDetails && bookingDetails.check_out_date) ? bookingDetails.check_out_date : (req.query.checkout || ""),
        type: cabinInfo.type
      });
    }

    // POST Request: Agree to waiver, save contact details, and notify operations
    if (req.method === 'POST') {
      const { email, phone, optIn, name, booking, checkin, checkout } = body;
      const bookingCode = booking || code || activeToken || '';
      
      if (!email || !phone) {
        return res.status(400).json({ error: 'Email address and phone number are required to check in.' });
      }

      // Capture check-in timestamp (UTC format)
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // Look up booking details if checkin or checkout dates are missing or incomplete
      let checkinDateVal = checkin || '';
      let checkoutDateVal = checkout || '';

      if (!checkinDateVal || !checkoutDateVal || checkinDateVal.length < 8) {
        try {
          const operationsApiUrl = process.env.OPERATIONS_API_URL || 'https://operations.lanterncamp.com';
          const bRes = await fetch(`${operationsApiUrl}/api/dashboard/bookings`);
          if (bRes.ok) {
            const data = await bRes.json();
            const bookings = data.bookings || [];
            const targetCode = bookingCode || code || activeToken;
            
            const matchedBooking = bookings.find(b => 
              String(b.id) === String(targetCode) || 
              (b.notes && b.notes.toLowerCase().includes(String(targetCode).toLowerCase())) ||
              (b.origin && b.origin.toLowerCase().includes(String(targetCode).toLowerCase())) ||
              (email && b.guest_email && b.guest_email.toLowerCase() === email.toLowerCase()) ||
              (name && b.guest_name && b.guest_name.toLowerCase().includes(name.toLowerCase()))
            );
            
            if (matchedBooking) {
              if (!checkinDateVal || checkinDateVal.length < 8) checkinDateVal = matchedBooking.check_in_date || '';
              if (!checkoutDateVal || checkoutDateVal.length < 8) checkoutDateVal = matchedBooking.check_out_date || '';
            }
          }
        } catch (err) {
          console.error("Error fetching booking dates for waiver CSV:", err);
        }
      }

      // Append signature details to Google Drive CSV
      const creds = getGoogleCreds();
      await appendRowToDrive(creds, [
        timestamp,
        bookingCode || activeToken || '',
        cabinInfo.cabinName,
        name || '',
        email,
        phone || '',
        'TRUE',
        optIn ? 'TRUE' : 'FALSE',
        checkinDateVal,
        checkoutDateVal
      ]);

      // Trigger Webhook to update operations portal in real-time
      const operationsApiUrl = process.env.OPERATIONS_API_URL || 'https://operations.lanterncamp.com';
      const webhookSecret = process.env.CHECKIN_WEBHOOK_SECRET;
      
      try {
        await fetch(`${operationsApiUrl}/api/checkin/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Checkin-Secret': webhookSecret } : {})
          },
          body: JSON.stringify({
            booking_id: bookingCode || booking || '',
            name: name || '',
            email: email || '',
            phone: phone || '',
            timestamp: timestamp,
            cabin_name: cabinInfo.cabinName
          })
        });
      } catch (err) {
        console.error("Failed to forward checkin webhook:", err);
      }

      // Return success confirmation (door codes sent separately via SMS)
      return res.status(200).json({
        success: true,
        cabinName: cabinInfo.cabinName,
        message: 'Waiver agreed and contact details confirmed. Access codes will be sent via SMS.'
      });
    }

    return res.status(405).json({ error: 'Method not allowed.' });

  } catch (error) {
    console.error('Error handling check-in:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
