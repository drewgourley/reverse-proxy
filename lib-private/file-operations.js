"use strict";

const AdmZip = require('adm-zip');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

/** Multer configuration for file uploads (100MB limit) */
const fileUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

/**
 * Validates service for file management operations
 * @param {Object} service - Service configuration object
 * @param {string} serviceName - Name of the service
 * @throws {Error} If service is not allowed to manage files
 * @returns {void}
 */
function validateServiceForFileManagement(service, serviceName) {
  if (!service) {
    const error = new Error('Service not found');
    error.statusCode = 404;
    throw error;
  }
  
  if (['api', 'www', 'radio'].includes(serviceName)) {
    const error = new Error('File management not allowed for this service');
    error.statusCode = 403;
    throw error;
  }
  
  const subdomainType = service.subdomain?.type;
  if (!['index', 'spa', 'dirlist'].includes(subdomainType)) {
    const error = new Error(`File management not available for ${subdomainType} type services`);
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Validates folder type
 * @param {string} folderType - Type of folder (public or static)
 * @throws {Error} If folder type is invalid
 * @returns {void}
 */
function validateFolderType(folderType) {
  if (!['public', 'static'].includes(folderType)) {
    const error = new Error('Invalid folder type');
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Validates path is within base folder (prevents path traversal)
 * @param {string} fullPath - Full path to validate
 * @param {string} basePath - Base path that fullPath must be within
 * @throws {Error} If path is invalid
 * @returns {void}
 */
function validatePath(fullPath, basePath) {
  if (!fullPath.startsWith(basePath)) {
    const error = new Error('Invalid path');
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Get files and directories in a service folder
 * @param {string} baseDir - Base directory
 * @param {string} serviceName - Service name
 * @param {'public'|'static'} folderType - Folder type
 * @param {Object} config - Application configuration
 * @param {string} [subPath=''] - Subpath inside the folder
 * @returns {{files: Array, currentPath: string}} Object containing files and currentPath
 */
function listFiles(baseDir, serviceName, folderType, config, subPath = '') {
  validateFolderType(folderType);
  
  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);
  
  const baseFolderPath = path.join(baseDir, 'web', folderType, serviceName);
  const currentFolderPath = path.join(baseFolderPath, subPath);
  
  validatePath(currentFolderPath, baseFolderPath);
  
  if (!fs.existsSync(baseFolderPath)) {
    fs.mkdirSync(baseFolderPath, { recursive: true });
  }
  
  if (!fs.existsSync(currentFolderPath)) {
    const error = new Error('Directory not found');
    error.statusCode = 404;
    throw error;
  }
  
  const files = [];
  const items = fs.readdirSync(currentFolderPath, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(currentFolderPath, item.name);
    
    if (item.isDirectory()) {
      files.push({
        name: item.name,
        path: item.name,
        type: 'directory',
        size: 0
      });
    } else {
      const stats = fs.statSync(fullPath);
      files.push({
        name: item.name,
        path: item.name,
        type: 'file',
        size: stats.size,
        modified: stats.mtime
      });
    }
  }
  
  return { files, currentPath: subPath };
}

/**
 * Upload a file to a service folder
 * @param {string} baseDir - Base directory
 * @param {string} serviceName - Service name
 * @param {'public'|'static'} folderType - Folder type
 * @param {Object} config - Application configuration
 * @param {Object} file - Multer file object (buffer, originalname, size, mimetype)
 * @param {string} [targetPath=''] - Target path inside the folder
 * @returns {{name:string, size:number, path:string}} Metadata about the uploaded file
 */
function uploadFile(baseDir, serviceName, folderType, config, file, targetPath = '') {
  if (!file) {
    const error = new Error('No file uploaded');
    error.statusCode = 400;
    throw error;
  }
  
  validateFolderType(folderType);
  
  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);
  
  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  const fullTargetPath = path.join(folderPath, targetPath);
  const targetDir = path.dirname(fullTargetPath);
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  fs.writeFileSync(fullTargetPath, file.buffer);
  
  return {
    name: file.originalname,
    size: file.size,
    path: path.relative(folderPath, fullTargetPath)
  };
}

/**
 * Delete a file or directory from a service folder
 * @param {string} baseDir - Base directory
 * @param {string} serviceName - Service name
 * @param {'public'|'static'} folderType - Folder type
 * @param {Object} config - Application configuration
 * @param {string} filePath - Relative path to file or directory
 * @returns {void}
 */
function deleteFile(baseDir, serviceName, folderType, config, filePath) {
  if (!filePath) {
    const error = new Error('File path is required');
    error.statusCode = 400;
    throw error;
  }
  
  validateFolderType(folderType);
  
  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);
  
  const isDirlist = service?.subdomain?.type === 'dirlist';
  
  if (isDirlist && folderType === 'public' && filePath === 'protected') {
    const error = new Error('Cannot delete the protected folder in dirlist services');
    error.statusCode = 400;
    throw error;
  }
  
  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const fullPath = path.join(folderPath, filePath);
  
  validatePath(fullPath, folderPath);
  
  if (!fs.existsSync(fullPath)) {
    const error = new Error('File not found');
    error.statusCode = 404;
    throw error;
  }
  
  const stats = fs.statSync(fullPath);
  
  if (stats.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(fullPath);
  }
}

/**
 * Create a directory in a service folder
 * @param {string} baseDir - Base directory
 * @param {string} serviceName - Service name
 * @param {'public'|'static'} folderType - Folder type
 * @param {Object} config - Application configuration
 * @param {string} directoryPath - Directory path to create (relative)
 * @returns {void}
 */
function createDirectory(baseDir, serviceName, folderType, config, directoryPath) {
  if (!directoryPath) {
    const error = new Error('Directory path is required');
    error.statusCode = 400;
    throw error;
  }
  
  validateFolderType(folderType);
  
  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);
  
  const isIndexService = service?.subdomain?.type === 'index';
  
  if (isIndexService && folderType === 'public') {
    const directoryName = directoryPath.split('/')[0];
    if (directoryName === 'static') {
      const error = new Error('Cannot create "static" folder in public directory for index services (reserved for /static route)');
      error.statusCode = 400;
      throw error;
    }
  }
  
  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const fullPath = path.join(folderPath, directoryPath);
  
  validatePath(fullPath, folderPath);
  
  if (fs.existsSync(fullPath)) {
    const error = new Error('Directory already exists');
    error.statusCode = 400;
    throw error;
  }
  
  fs.mkdirSync(fullPath, { recursive: true });
}

/**
 * Rename a file or directory in a service folder
 * @param {string} baseDir - Base directory
 * @param {string} serviceName - Service name
 * @param {'public'|'static'} folderType - Folder type
 * @param {Object} config - Application configuration
 * @param {string} oldPath - Existing relative path
 * @param {string} newPath - New relative path
 * @returns {void}
 */
function renameFile(baseDir, serviceName, folderType, config, oldPath, newPath) {
  if (!oldPath || !newPath) {
    const error = new Error('Both old and new paths are required');
    error.statusCode = 400;
    throw error;
  }
  
  validateFolderType(folderType);
  
  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);
  
  const isDirlist = service?.subdomain?.type === 'dirlist';
  
  if (isDirlist && folderType === 'public' && oldPath === 'protected') {
    const error = new Error('Cannot rename the protected folder in dirlist services');
    error.statusCode = 400;
    throw error;
  }
  
  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const fullOldPath = path.join(folderPath, oldPath);
  const fullNewPath = path.join(folderPath, newPath);
  
  validatePath(fullOldPath, folderPath);
  validatePath(fullNewPath, folderPath);
  
  if (!fs.existsSync(fullOldPath)) {
    const error = new Error('Source file not found');
    error.statusCode = 404;
    throw error;
  }
  
  if (fs.existsSync(fullNewPath)) {
    const error = new Error('File already exists');
    error.statusCode = 400;
    throw error;
  }
  
  fs.renameSync(fullOldPath, fullNewPath);
}

/**
 * Unpack a zip file into a service folder
 * @param {string} baseDir - Base directory
 * @param {string} serviceName - Service name
 * @param {'public'|'static'} folderType - Folder type
 * @param {Object} config - Application configuration
 * @param {Object} file - Multer file object for the uploaded zip
 * @param {string} targetPath - Target directory inside the service folder
 * @param {boolean} [deploy=false] - If true, deploy mode clears target folder first
 * @returns {{filesExtracted: number}} Result containing number of files extracted
 */
function unpackZip(baseDir, serviceName, folderType, config, file, targetPath, deploy = false) {
  if (!file) {
    const error = new Error('No zip file provided');
    error.statusCode = 400;
    throw error;
  }
  
  validateFolderType(folderType);
  
  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);
  
  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const extractPath = targetPath ? path.join(folderPath, targetPath) : folderPath;
  
  validatePath(extractPath, folderPath);
  
  if (!file.originalname.toLowerCase().endsWith('.zip')) {
    const error = new Error('File must be a zip archive');
    error.statusCode = 400;
    throw error;
  }
  
  let zip;
  try {
    zip = new AdmZip(file.buffer);
  } catch (error) {
    const err = new Error('Invalid or corrupted zip file');
    err.statusCode = 400;
    throw err;
  }
  
  const zipEntries = zip.getEntries();
  
  // Validate paths in zip
  for (const entry of zipEntries) {
    const entryPath = path.join(extractPath, entry.entryName);
    if (!entryPath.startsWith(extractPath)) {
      const error = new Error('Zip contains invalid paths (potential path traversal attack)');
      error.statusCode = 400;
      throw error;
    }
  }
  
  // Check file count
  if (zipEntries.length > 1000) {
    const error = new Error('Zip contains too many files (max 1000)');
    error.statusCode = 400;
    throw error;
  }
  
  // Check total size
  let totalSize = 0;
  const maxSize = 100 * 1024 * 1024; // 100MB
  for (const entry of zipEntries) {
    totalSize += entry.header.size;
    if (totalSize > maxSize) {
      const error = new Error('Zip uncompressed size exceeds limit (max 100MB)');
      error.statusCode = 400;
      throw error;
    }
  }
  
  // Clear directory if deploy mode
  if (deploy) {
    if (fs.existsSync(extractPath)) {
      const items = fs.readdirSync(extractPath);
      for (const item of items) {
        const itemPath = path.join(extractPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(itemPath);
        }
      }
    }
  }
  
  zip.extractAllTo(extractPath, true);
  
  return { filesExtracted: zipEntries.length };
}

module.exports = {
  fileUpload,
  listFiles,
  uploadFile,
  deleteFile,
  createDirectory,
  renameFile,
  unpackZip
};
