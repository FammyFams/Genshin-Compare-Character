// Simple local proxy for Enka.Network API
// Run: node proxy.js
const http  = require('http');
const https = require('https');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Strip leading slash to get the path to proxy
    const path = req.url.replace(/^\//, '');

    // Only allow enka.network paths
    if (!path.startsWith('api/') && !path.includes('enka.network')) {
        res.writeHead(400);
        res.end('Bad request');
        return;
    }

    const target = path.startsWith('http')
        ? path
        : `https://enka.network/${path}`;

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GenshinCompare/1.0)',
        }
    };

    https.get(target, options, (apiRes) => {
        res.writeHead(apiRes.statusCode, {
            'Content-Type': apiRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        apiRes.pipe(res);
    }).on('error', (e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
    });
});

server.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
