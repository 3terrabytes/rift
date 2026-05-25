import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import worldsRouter from './routes/worlds.js';
import characterRouter from './routes/character.js';
import inventoryRouter from './routes/inventory.js';
import craftingRouter from './routes/crafting.js';
import riftRouter from './routes/rift.js';
import { attachMultiplayer } from './multiplayer.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const app = express();

app.use(express.json({ limit: '20mb' }));
const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: allowed.includes('*') ? true : allowed,
  credentials: true,
}));

// Allow embedding in iframes (any origin).
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *;");
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Rift', time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/worlds', worldsRouter);
app.use('/api/character', characterRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/crafting', craftingRouter);
app.use('/api/rift', riftRouter);

// Static frontend.
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Embed snippet
app.get('/embed.js', (_req, res) => {
  res.type('application/javascript').send(`(function(){
    var s = document.currentScript;
    var host = (s && s.getAttribute('data-host')) || location.origin;
    var w = (s && s.getAttribute('data-width')) || '100%';
    var h = (s && s.getAttribute('data-height')) || '720';
    var i = document.createElement('iframe');
    i.src = host;
    i.width = w; i.height = h;
    i.style.border = '0';
    i.allow = 'fullscreen';
    s.parentNode.insertBefore(i, s);
  })();`);
});

// SPA fallback for non-API routes.
app.get(/^(?!\/api\/|\/ws|\/embed\.js).*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const server = http.createServer(app);
attachMultiplayer(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[rift] listening on http://localhost:${PORT}`);
});
