// scripts/write-version.js
const fs = require('fs');
const path = require('path');

const version =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  Date.now().toString();

const out = {
  version,
  buildTime: new Date().toISOString(),
};

const outPath = path.resolve(process.cwd(), 'public', 'version.json');

fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');

console.log('version.json ->', out);
