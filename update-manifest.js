#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, 'me.broken_by.PdfMetadataEditor.yml');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js script' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function getReleaseInfo(tag) {
  const url = `https://api.github.com/repos/zaro/pdf-metadata-editor/releases/tags/${tag}`;
  const data = await fetch(url);
  return JSON.parse(data);
}

async function main() {
  const [,, version] = process.argv;

  if (!version) {
    console.error('Usage: node update-manifest.js <release-version>');
    process.exit(1);
  }

  const tag = version.startsWith('v') ? version : `v${version}`;
  console.log(`Fetching release info for ${tag}...`);

  const releaseInfo = await getReleaseInfo(tag);
  const assets = releaseInfo.assets || [];

  const assetMap = {};
  for (const asset of assets) {
    assetMap[asset.name] = {
      url: asset.browser_download_url,
      sha256: asset.digest.replace(/^sha256:/, '')
    };
  }

  console.log(`Found ${assets.length} assets`);

  let content = fs.readFileSync(MANIFEST_PATH, 'utf8');

  const replacements = [
    { assetName: `pdf-metadata-editor-${version}-amd64-linux-portable.tar.gz`, arch: 'x86_64' },
    { assetName: `pdf-metadata-editor-${version}-arm64-linux-portable.tar.gz`, arch: 'aarch64' }
  ];

  for (const { assetName, arch } of replacements) {
    const asset = assetMap[assetName];
    if (!asset) {
      console.log(`Asset ${assetName} not found, skipping`);
      continue;
    }

    console.log(`Updating ${assetName}`);
    console.log(`  URL: ${asset.url}`);
    console.log(`  SHA256: ${asset.sha256}`);

    const blockRegex = new RegExp(
      `(-\\s*type:\\s*archive\\s*\\n\\s*url:\\s*)[^\\n]+\\n(\\s*sha256:\\s*)[a-f0-9]+(\\s*\\n\\s*dest:\\s*app\\s*\\n\\s*only-arches:\\s*\\n\\s*-\\s*${arch})`,
      'g'
    );

    const block = `- type: archive
        url: ${asset.url}
        sha256: ${asset.sha256}
        dest: app
        only-arches:
          - ${arch}`;

    content = content.replace(blockRegex, block);
  }

  fs.writeFileSync(MANIFEST_PATH, content);
  console.log('Manifest updated successfully!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});