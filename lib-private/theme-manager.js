"use strict";

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

/**
 * Read colors configuration
 * @param {string} baseDir - Base directory
 * @returns {Object} Colors configuration
 */
function readColors(baseDir) {
  const colorsPath = path.join(baseDir, 'web', 'global', 'colors.json');
  const colorsData = fs.readFileSync(colorsPath, 'utf8');
  return JSON.parse(colorsData);
}

/**
 * Update colors and related files
 * @param {string} baseDir - Base directory
 * @param {Object} updatedColors - New colors configuration
 */
function updateColors(baseDir, updatedColors) {
  const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
  const colorFields = ['primary', 'secondary', 'accent', 'background', 'inverse'];
  const receivedFields = Object.keys(updatedColors);
  const extraFields = receivedFields.filter(f => !colorFields.includes(f));
  
  if (extraFields.length > 0) {
    const error = new Error(`Unexpected fields: ${extraFields.join(', ')}. Only ${colorFields.join(', ')} are allowed.`);
    error.statusCode = 400;
    throw error;
  }
  
  for (const field of colorFields) {
    if (!updatedColors[field]) {
      const error = new Error(`Missing required field: ${field}`);
      error.statusCode = 400;
      throw error;
    }
    if (typeof updatedColors[field] !== 'string') {
      const error = new Error(`Invalid type for ${field}. Must be a string.`);
      error.statusCode = 400;
      throw error;
    }
    if (!hexColorRegex.test(updatedColors[field])) {
      const error = new Error(`Invalid color format for ${field}. Must be a valid hex color (e.g., #ffffff or #fff)`);
      error.statusCode = 400;
      throw error;
    }
  }
  
  // Save colors.json
  const colorsPath = path.join(baseDir, 'web', 'global', 'colors.json');
  fs.writeFileSync(colorsPath, JSON.stringify(updatedColors, null, 2));
  
  // Update browserconfig.xml
  const browserconfigPath = path.join(baseDir, 'web', 'global', 'favicon', 'browserconfig.xml');
  const browserconfigContent = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
    <msapplication>
        <tile>
            <square150x150logo src="/mstile-150x150.png"/>
            <TileColor>${updatedColors.primary || '#ffffff'}</TileColor>
        </tile>
    </msapplication>
</browserconfig>
`;
  fs.writeFileSync(browserconfigPath, browserconfigContent);
  
  // Update site.webmanifest
  const webmanifestPath = path.join(baseDir, 'web', 'global', 'favicon', 'site.webmanifest');
  const webmanifest = {
    name: "Reverse Proxy Server",
    short_name: "ReverseProxy",
    icons: [
      {
        src: "./android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png"
      }
    ],
    theme_color: updatedColors.primary || '#ffffff',
    background_color: updatedColors.background || '#000000',
    display: "standalone"
  };
  fs.writeFileSync(webmanifestPath, JSON.stringify(webmanifest, null, 4));
}

/**
 * Upload and process favicon files
 * @param {string} baseDir - Base directory
 * @param {Object} file - Uploaded file object
 */
async function uploadFavicon(baseDir, file) {
  if (!file) {
    const error = new Error('No file uploaded');
    error.statusCode = 400;
    throw error;
  }
  
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    const error = new Error(`Invalid file type. Only image files are allowed (${allowedMimeTypes.join(', ')})`);
    error.statusCode = 400;
    throw error;
  }
  
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    const error = new Error('File too large. Maximum size is 5MB');
    error.statusCode = 400;
    throw error;
  }
  
  const faviconDir = path.join(baseDir, 'web', 'global', 'favicon');
  if (!fs.existsSync(faviconDir)) {
    fs.mkdirSync(faviconDir, { recursive: true });
  }
  
  // Save original
  const originalPath = path.join(faviconDir, 'favicon-original.png');
  fs.writeFileSync(originalPath, file.buffer);
  
  // Generate different sizes
  const sizes = [
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'mstile-150x150.png', size: 150 }
  ];
  
  for (const { name, size } of sizes) {
    await sharp(file.buffer)
      .resize(size, size)
      .png()
      .toFile(path.join(faviconDir, name));
  }
  
  // Generate .ico file
  const ico32 = await sharp(file.buffer).resize(32, 32).png().toBuffer();
  const ico16 = await sharp(file.buffer).resize(16, 16).png().toBuffer();
  const icoBuffer = await toIco([ico32, ico16]);
  fs.writeFileSync(path.join(faviconDir, 'favicon.ico'), icoBuffer);
}

module.exports = {
  readColors,
  updateColors,
  uploadFavicon
};
