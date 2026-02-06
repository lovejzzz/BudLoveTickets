const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3456;
const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');

// ===== PROJECT DATA EXTRACTION =====

function extractProjects() {
  const projects = {};
  const allFeatures = [];
  const tags = new Set();
  let totalUpdates = 0;

  // Parse MEMORY.md for long-term project data
  const memoryPath = path.join(WORKSPACE, 'MEMORY.md');
  if (fs.existsSync(memoryPath)) {
    const content = fs.readFileSync(memoryPath, 'utf-8');
    parseProjectsFromMemory(content, projects, allFeatures, tags);
  }

  // Parse daily memory files for detailed features
  const memoryDir = path.join(WORKSPACE, 'memory');
  if (fs.existsSync(memoryDir)) {
    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    for (const file of files) {
      const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8');
      const date = file.replace('.md', '');
      parseProjectsFromDaily(content, date, projects, allFeatures, tags);
      totalUpdates++;
    }
  }

  // Calculate stats
  const stats = {
    totalProjects: Object.keys(projects).length,
    totalFeatures: allFeatures.length,
    totalUpdates,
    allTags: Array.from(tags)
  };

  // Find cross-links between projects
  const crossLinks = findCrossLinks(projects);

  return { projects, allFeatures, stats, crossLinks };
}

function parseProjectsFromMemory(content, projects, allFeatures, tags) {
  const lines = content.split('\n');
  let currentProject = null;
  let inProjectSection = false;

  for (const line of lines) {
    // Check for project section
    if (line.startsWith('## Projects')) {
      inProjectSection = true;
      continue;
    }
    if (line.startsWith('## ') && !line.includes('Projects')) {
      inProjectSection = false;
    }

    // Parse project headers - ### ProjectName (date)
    const projectMatch = line.match(/^### (.+?)\s*\((\d{4}-\d{2}-\d{2})\)/);
    if (projectMatch) {
      const name = projectMatch[1].trim();
      const date = projectMatch[2];
      const key = normalizeProjectKey(slugify(name));
      
      if (!projects[key]) {
        projects[key] = {
          key,
          icon: getProjectIcon(name),
          title: name,
          desc: '',
          created: date,
          version: '1.0.0',
          features: [],
          history: [],
          keywords: new Set(),
          targetFeatures: 10 // Default target for progress
        };
      }
      currentProject = key;
      continue;
    }

    // Parse description (first line after ### that isn't a bullet)
    if (currentProject && !line.startsWith('-') && !line.startsWith('*') && line.trim() && !line.startsWith('#')) {
      if (!projects[currentProject].desc) {
        projects[currentProject].desc = line.trim();
      }
    }

    // Parse features from bullets
    if (currentProject && (line.startsWith('- ') || line.startsWith('* '))) {
      const feature = parseFeatureLine(line, projects[currentProject].created);
      if (feature) {
        // Avoid duplicates
        if (!projects[currentProject].features.find(f => f.title === feature.title)) {
          projects[currentProject].features.push(feature);
          allFeatures.push({ ...feature, project: currentProject });
          feature.tags.forEach(t => tags.add(t));
          feature.tags.forEach(t => projects[currentProject].keywords.add(t));
        }
      }
    }
  }
}

function parseProjectsFromDaily(content, fileDate, projects, allFeatures, tags) {
  const lines = content.split('\n');
  let currentProject = null;
  let currentSection = null;
  let collectingFeatures = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect project sections - "## Built Today: ProjectName" or "## ProjectName" or "### ProjectName"
    const builtMatch = line.match(/^##\s+(?:Built(?:\s+Today)?:?\s*)?[`']?(.+?)[`']?\s*(?:CLI)?$/);
    const projectHeaderMatch = line.match(/^###?\s+(?:What It Is|Features|Commands|Key Files|Tech Stack|Current State)/i);
    
    if (builtMatch && !projectHeaderMatch) {
      const name = builtMatch[1].replace(/[`']/g, '').trim();
      // Skip generic headers and non-project sections
      const skipPatterns = [
        'User Context', 'Config Updates', 'Summary', 'Overnight Work',
        'Token Optimization', 'Model Notes', 'User Preferences', 'Key Decisions',
        'Next Steps', 'Critical Context', 'Progress', 'Blocked', 'In Progress'
      ];
      if (skipPatterns.some(s => name.toLowerCase().includes(s.toLowerCase()))) {
        currentProject = null;
        continue;
      }
      const key = normalizeProjectKey(slugify(name));
      
      if (!projects[key]) {
        projects[key] = {
          key,
          icon: getProjectIcon(name),
          title: cleanProjectTitle(name),
          desc: '',
          created: fileDate,
          version: '1.0.0',
          features: [],
          history: [{ version: '1.0.0', date: fileDate, changes: 'Initial build' }],
          keywords: new Set(),
          targetFeatures: 10
        };
      }
      currentProject = key;
      collectingFeatures = false;
      continue;
    }

    // Detect feature sections
    if (line.match(/^###\s+(Features|Commands|What It Does)/i)) {
      collectingFeatures = true;
      currentSection = line.replace('### ', '').trim();
      continue;
    }
    if (line.startsWith('### ') && currentProject) {
      collectingFeatures = false;
      currentSection = line.replace('### ', '').trim();
      
      // Capture version info
      const versionMatch = currentSection.match(/v?(\d+\.\d+\.\d+)/);
      if (versionMatch && projects[currentProject]) {
        const ver = versionMatch[1];
        if (ver > projects[currentProject].version) {
          projects[currentProject].version = ver;
          if (!projects[currentProject].history.find(h => h.version === ver)) {
            projects[currentProject].history.push({ version: ver, date: fileDate, changes: currentSection });
          }
        }
      }
      continue;
    }

    // Parse description line right after project header
    if (currentProject && !projects[currentProject].desc && line.trim() && 
        !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*') &&
        !line.startsWith('Location:') && !line.startsWith('Run:')) {
      projects[currentProject].desc = line.trim();
    }

    // Parse feature bullets
    if (currentProject && (line.startsWith('- ') || line.startsWith('* '))) {
      const feature = parseFeatureLine(line, fileDate);
      if (feature && projects[currentProject]) {
        // Check for duplicates
        if (!projects[currentProject].features.find(f => f.title === feature.title)) {
          projects[currentProject].features.push(feature);
          allFeatures.push({ ...feature, project: currentProject, date: fileDate });
          feature.tags.forEach(t => tags.add(t));
          feature.tags.forEach(t => projects[currentProject].keywords.add(t));
        }
      }
    }
  }

  // Convert keyword sets to arrays
  Object.values(projects).forEach(p => {
    if (p.keywords instanceof Set) {
      p.keywords = Array.from(p.keywords);
    }
  });
}

function parseFeatureLine(line, date) {
  // Remove bullet
  let text = line.replace(/^[-*]\s+/, '').trim();
  if (!text || text.length < 3) return null;

  // Skip non-feature lines
  if (text.startsWith('Location:') || text.startsWith('Run:') || text.startsWith('Data:')) return null;

  // Parse "**Title** — Description" or "**Title**: Description" or "`command` — Description"
  let title, desc;
  
  const boldMatch = text.match(/^\*\*([^*]+)\*\*\s*[-—:]\s*(.+)/);
  const codeMatch = text.match(/^`([^`]+)`\s*[-—:]\s*(.+)/);
  
  if (boldMatch) {
    title = boldMatch[1].trim();
    desc = boldMatch[2].trim();
  } else if (codeMatch) {
    title = codeMatch[1].trim();
    desc = codeMatch[2].trim();
  } else {
    // Just use first part as title
    title = text.slice(0, 50);
    desc = text.length > 50 ? text.slice(50) : '';
  }

  // Extract tags from backticks and tech words
  const tags = extractTags(text);
  
  return {
    icon: getFeatureIcon(title, desc),
    title: title.slice(0, 60),
    desc: desc.slice(0, 200),
    tags,
    added: date
  };
}

function extractTags(text) {
  const tags = new Set();
  const lower = text.toLowerCase();
  
  // Extract backtick content
  const backticks = text.match(/`([^`]+)`/g) || [];
  backticks.forEach(bt => {
    const tag = bt.replace(/`/g, '').toLowerCase();
    if (tag.length > 1 && tag.length < 20) tags.add(tag);
  });

  // Tech keywords
  const techWords = ['cli', 'api', 'sqlite', 'electron', 'node', 'react', 'websocket', 
    'discord', 'macos', 'gateway', 'token', 'session', 'config', 'sync', 'ui', 
    'database', 'http', 'json', 'tray', 'menu bar', 'dark mode', 'pwa', 'offline'];
  
  techWords.forEach(kw => {
    if (lower.includes(kw)) tags.add(kw);
  });

  return Array.from(tags).slice(0, 5);
}

function getProjectIcon(name) {
  const lower = name.toLowerCase();
  if (lower.includes('billing')) return '🧾';
  if (lower.includes('desktop')) return '💻';
  if (lower.includes('detective') || lower.includes('wall')) return '🔍';
  if (lower.includes('openclaw')) return '🦞';
  return '📁';
}

function getFeatureIcon(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  if (text.includes('track') || text.includes('monitor')) return '📊';
  if (text.includes('database') || text.includes('sqlite') || text.includes('storage')) return '💾';
  if (text.includes('sync') || text.includes('update')) return '🔄';
  if (text.includes('alert') || text.includes('warning')) return '⚠️';
  if (text.includes('command') || text.includes('cli')) return '⌨️';
  if (text.includes('tray') || text.includes('icon')) return '🔘';
  if (text.includes('control') || text.includes('start') || text.includes('stop')) return '🎛️';
  if (text.includes('setting') || text.includes('config')) return '⚙️';
  if (text.includes('dark') || text.includes('theme')) return '🌙';
  if (text.includes('stat') || text.includes('chart')) return '📈';
  if (text.includes('search')) return '🔎';
  if (text.includes('mobile') || text.includes('phone')) return '📱';
  if (text.includes('tab') || text.includes('nav')) return '📑';
  if (text.includes('note') || text.includes('sticky')) return '📌';
  if (text.includes('link') || text.includes('connect')) return '🔗';
  if (text.includes('export') || text.includes('save')) return '💾';
  return '✨';
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

// Normalize project names to consolidate versions/updates
function normalizeProjectKey(slug) {
  return slug
    // Remove version patterns: v1, v2, v4, etc.
    .replace(/-v\d+(-\w+)?$/, '')
    .replace(/-v\d+/g, '')
    // Remove common suffixes
    .replace(/-(final|fixes|update|updates|version|features|feature|full|complete|new|improved|morning-ses).*$/, '')
    // Remove trailing numbers
    .replace(/-\d+$/, '')
    // Clean up any double dashes
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanProjectTitle(name) {
  return name
    .replace(/`/g, '')
    .replace(/CLI$/i, '')
    .trim();
}

function findCrossLinks(projects) {
  const links = [];
  const projectKeys = Object.keys(projects);

  for (let i = 0; i < projectKeys.length; i++) {
    for (let j = i + 1; j < projectKeys.length; j++) {
      const a = projects[projectKeys[i]];
      const b = projects[projectKeys[j]];
      
      const aKeywords = new Set(a.keywords || []);
      const bKeywords = new Set(b.keywords || []);
      
      const shared = [...aKeywords].filter(k => bKeywords.has(k));
      
      if (shared.length > 0) {
        links.push({
          from: projectKeys[i],
          to: projectKeys[j],
          keywords: shared,
          strength: shared.length
        });
      }
    }
  }

  return links;
}

// ===== ACHIEVEMENTS SYSTEM =====

function calculateAchievements(stats, projects) {
  const achievements = [];
  
  if (stats.totalProjects >= 1) achievements.push({ icon: '🚀', name: 'First Project', desc: 'Built your first project' });
  if (stats.totalProjects >= 3) achievements.push({ icon: '🏗️', name: 'Builder', desc: 'Built 3+ projects' });
  if (stats.totalProjects >= 5) achievements.push({ icon: '🏭', name: 'Factory', desc: 'Built 5+ projects' });
  if (stats.totalFeatures >= 10) achievements.push({ icon: '⭐', name: 'Feature Rich', desc: '10+ features across projects' });
  if (stats.totalFeatures >= 25) achievements.push({ icon: '💫', name: 'Feature Master', desc: '25+ features built' });
  if (stats.totalFeatures >= 50) achievements.push({ icon: '🌟', name: 'Feature Legend', desc: '50+ features!' });
  if (stats.allTags.includes('pwa')) achievements.push({ icon: '📱', name: 'PWA Pioneer', desc: 'Built a Progressive Web App' });
  if (stats.allTags.includes('electron')) achievements.push({ icon: '💻', name: 'Desktop Dev', desc: 'Built an Electron app' });
  if (stats.allTags.includes('cli')) achievements.push({ icon: '⌨️', name: 'CLI Crafter', desc: 'Built a CLI tool' });
  if (stats.allTags.includes('websocket')) achievements.push({ icon: '🔌', name: 'Real-time', desc: 'Used WebSockets' });
  
  return achievements;
}

// ===== STATIC FILE SERVER =====

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(res, filePath) {
  try {
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ===== TICKETS API =====

const TICKETS_FILE = path.join(__dirname, 'tickets.json');

function loadTickets() {
  try {
    if (fs.existsSync(TICKETS_FILE)) {
      return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading tickets:', e);
  }
  return { tickets: [] };
}

function saveTickets(data) {
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2));
  broadcast({ type: 'tickets', data: data.tickets });
}

function handleTicketsAPI(req, res) {
  if (req.method === 'GET') {
    const data = loadTickets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data.tickets));
  } 
  else if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const ticket = JSON.parse(body);
        const data = loadTickets();
        ticket.id = Date.now().toString();
        ticket.created = new Date().toISOString().split('T')[0];
        data.tickets.push(ticket);
        saveTickets(data);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ticket));
      } catch (e) {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
  }
  else {
    res.writeHead(405);
    res.end('Method not allowed');
  }
}

function handleTicketAPI(req, res, id) {
  const data = loadTickets();
  const idx = data.tickets.findIndex(t => t.id === id);
  
  if (req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        if (idx >= 0) {
          data.tickets[idx] = { ...data.tickets[idx], ...updates };
        } else {
          updates.id = id;
          updates.created = new Date().toISOString().split('T')[0];
          data.tickets.push(updates);
        }
        saveTickets(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data.tickets[idx >= 0 ? idx : data.tickets.length - 1]));
      } catch (e) {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
  }
  else if (req.method === 'DELETE') {
    if (idx >= 0) {
      data.tickets.splice(idx, 1);
      saveTickets(data);
      res.writeHead(200);
      res.end('Deleted');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
  else if (req.method === 'GET') {
    if (idx >= 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data.tickets[idx]));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
  else {
    res.writeHead(405);
    res.end('Method not allowed');
  }
}

// ===== HTTP SERVER =====

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Static files
  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(res, path.join(__dirname, 'index.html'));
  } 
  else if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    serveStatic(res, path.join(__dirname, 'manifest.json'));
  }
  else if (pathname === '/sw.js') {
    serveStatic(res, path.join(__dirname, 'sw.js'));
  }
  else if (pathname.startsWith('/icons/')) {
    serveStatic(res, path.join(__dirname, pathname));
  }
  // API endpoints
  else if (pathname === '/api/projects') {
    const data = extractProjects();
    const achievements = calculateAchievements(data.stats, data.projects);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...data, achievements }));
  }
  else if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  }
  // Tickets API
  else if (pathname === '/api/tickets') {
    handleTicketsAPI(req, res);
  }
  else if (pathname.startsWith('/api/tickets/')) {
    handleTicketAPI(req, res, pathname.split('/')[3]);
  }
  // Let's Do It! - notify OpenClaw directly
  else if (pathname === '/api/lets-do-it') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { tasks } = JSON.parse(body);
          const taskList = tasks.map(t => `• ${t.title}${t.desc ? ` - ${t.desc}` : ''}`).join('\n');
          
          // Send wake event to OpenClaw gateway
          const wakePayload = JSON.stringify({
            action: 'wake',
            text: `🚀 Bud Love Tickets tasks incoming!\n\n${taskList}\n\nPlease work on these tickets.`,
            mode: 'now'
          });
          
          const wakeReq = http.request({
            hostname: 'localhost',
            port: 18789,
            path: '/api/cron',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer 6b314debefdef218b46080da31fa0d4843354fd286b2f81b'
            }
          }, (wakeRes) => {
            console.log('📤 Wake sent to OpenClaw:', wakeRes.statusCode);
          });
          
          wakeReq.on('error', (e) => console.error('Wake error:', e.message));
          wakeReq.write(wakePayload);
          wakeReq.end();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400);
          res.end('Invalid request');
        }
      });
    } else {
      res.writeHead(405);
      res.end('Method not allowed');
    }
  }
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ===== WEBSOCKET SERVER =====

const wss = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('📡 Client connected');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('📡 Client disconnected');
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ===== FILE WATCHER =====

let watchDebounce = null;

function watchMemoryFiles() {
  const paths = [
    path.join(WORKSPACE, 'MEMORY.md'),
    path.join(WORKSPACE, 'memory')
  ];
  
  paths.forEach(p => {
    if (fs.existsSync(p)) {
      fs.watch(p, { recursive: true }, (event, filename) => {
        clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          console.log(`📂 File changed: ${filename}`);
          broadcast({ type: 'refresh', reason: filename });
        }, 500);
      });
    }
  });
  
  console.log('👁️  Watching memory files for changes');
}

// ===== START SERVER =====

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('🔍 DETECTIVE WALL v4.0');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIP}:${PORT}`);
  console.log('');
  console.log('  📱 PWA: Add to Home Screen for offline access!');
  console.log('  🔄 WebSocket: Real-time updates enabled');
  console.log('  📊 API: /api/projects for dynamic data');
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('');
  
  watchMemoryFiles();
});
