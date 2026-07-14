import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import check-in serverless handler
const { default: checkinHandler } = await import(path.join(__dirname, 'api/checkin.js'));

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  console.log(`[DEBUG] ${req.method} ${req.url}`);

  // Helper to parse JSON POST bodies
  const getBody = () => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
    });
  };

  // Route API handler
  if (pathname.startsWith('/api/checkin')) {
    const vercelReq = {
      method: req.method,
      query: Object.fromEntries(parsedUrl.searchParams),
      body: req.method === 'POST' ? await getBody() : {},
      headers: req.headers
    };

    const vercelRes = {
      statusCode: 200,
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
        res.setHeader(key, value);
      },
      status(code) {
        this.statusCode = code;
        res.statusCode = code;
        return this;
      },
      json(data) {
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return this;
      },
      end() {
        res.writeHead(this.statusCode);
        res.end();
        return this;
      }
    };

    try {
      await checkinHandler(vercelReq, vercelRes);
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', details: err.message }));
    }
    return;
  }

  // Rewrite /:token (6 character alphanumeric string) to index.html (client-side JS will resolve the token)
  const tokenMatch = pathname.match(/^\/([a-zA-Z0-9]{6})$/);
  if (tokenMatch) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.end(html);
    return;
  }

  // Route root to index.html
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }

  // Serve static files
  const filePath = path.join(__dirname, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Standalone Check-in Server running locally at http://localhost:${PORT}`);
  console.log(`Test link: http://localhost:${PORT}/a7B2xD`);
});
