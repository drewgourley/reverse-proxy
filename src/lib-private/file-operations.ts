const AdmZip: any = require('adm-zip');
import fs from 'fs';
import multer from 'multer';
import path from 'path';

export const fileUpload: any = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

export function validateServiceForFileManagement(service: any, serviceName: string) {
  if (!service) {
    const error: any = new Error('Service not found');
    error.statusCode = 404;
    throw error;
  }

  if (['api', 'www', 'radio'].includes(serviceName)) {
    const error: any = new Error('File management not allowed for this service');
    error.statusCode = 403;
    throw error;
  }

  const subdomainType = service.subdomain?.type;
  if (!['index', 'spa', 'dirlist'].includes(subdomainType)) {
    const error: any = new Error(
      `File management not available for ${subdomainType} type services`,
    );
    error.statusCode = 400;
    throw error;
  }
}

export function validateFolderType(folderType: string) {
  if (!['public', 'static'].includes(folderType)) {
    const error: any = new Error('Invalid folder type');
    error.statusCode = 400;
    throw error;
  }
}

export function validatePath(fullPath: string, basePath: string) {
  if (!fullPath.startsWith(basePath)) {
    const error: any = new Error('Invalid path');
    error.statusCode = 400;
    throw error;
  }
}

export function listFiles(
  baseDir: string,
  serviceName: string,
  folderType: string,
  config: any,
  subPath = '',
) {
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
    const error: any = new Error('Directory not found');
    error.statusCode = 404;
    throw error;
  }

  const files: any[] = [];
  const items = fs.readdirSync(currentFolderPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(currentFolderPath, item.name);

    if (item.isDirectory()) {
      files.push({
        name: item.name,
        path: item.name,
        type: 'directory',
        size: 0,
      });
    } else {
      const stats = fs.statSync(fullPath);
      files.push({
        name: item.name,
        path: item.name,
        type: 'file',
        size: stats.size,
        modified: stats.mtime,
      });
    }
  }

  return { files, currentPath: subPath };
}

export function uploadFile(
  baseDir: string,
  serviceName: string,
  folderType: string,
  config: any,
  file: any,
  targetPath = '',
) {
  if (!file) {
    const error: any = new Error('No file uploaded');
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
    path: path.relative(folderPath, fullTargetPath),
  };
}

export function deleteFile(
  baseDir: string,
  serviceName: string,
  folderType: string,
  config: any,
  filePath: string,
) {
  if (!filePath) {
    const error: any = new Error('File path is required');
    error.statusCode = 400;
    throw error;
  }

  validateFolderType(folderType);

  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);

  const isDirlist = service?.subdomain?.type === 'dirlist';

  if (isDirlist && folderType === 'public' && filePath === 'protected') {
    const error: any = new Error('Cannot delete the protected folder in dirlist services');
    error.statusCode = 400;
    throw error;
  }

  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const fullPath = path.join(folderPath, filePath);

  validatePath(fullPath, folderPath);

  if (!fs.existsSync(fullPath)) {
    const error: any = new Error('File not found');
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

export function createDirectory(
  baseDir: string,
  serviceName: string,
  folderType: string,
  config: any,
  directoryPath: string,
) {
  if (!directoryPath) {
    const error: any = new Error('Directory path is required');
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
      const error: any = new Error(
        'Cannot create "static" folder in public directory for index services (reserved for /static route)',
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const fullPath = path.join(folderPath, directoryPath);

  validatePath(fullPath, folderPath);

  if (fs.existsSync(fullPath)) {
    const error: any = new Error('Directory already exists');
    error.statusCode = 400;
    throw error;
  }

  fs.mkdirSync(fullPath, { recursive: true });
}

export function renameFile(
  baseDir: string,
  serviceName: string,
  folderType: string,
  config: any,
  oldPath: string,
  newPath: string,
) {
  if (!oldPath || !newPath) {
    const error: any = new Error('Both old and new paths are required');
    error.statusCode = 400;
    throw error;
  }

  validateFolderType(folderType);

  const service = config.services?.[serviceName];
  validateServiceForFileManagement(service, serviceName);

  const isDirlist = service?.subdomain?.type === 'dirlist';

  if (isDirlist && folderType === 'public' && oldPath === 'protected') {
    const error: any = new Error('Cannot rename the protected folder in dirlist services');
    error.statusCode = 400;
    throw error;
  }

  const folderPath = path.join(baseDir, 'web', folderType, serviceName);
  const fullOldPath = path.join(folderPath, oldPath);
  const fullNewPath = path.join(folderPath, newPath);

  validatePath(fullOldPath, folderPath);
  validatePath(fullNewPath, folderPath);

  if (!fs.existsSync(fullOldPath)) {
    const error: any = new Error('Source file not found');
    error.statusCode = 404;
    throw error;
  }

  if (fs.existsSync(fullNewPath)) {
    const error: any = new Error('File already exists');
    error.statusCode = 400;
    throw error;
  }

  fs.renameSync(fullOldPath, fullNewPath);
}

export function unpackZip(
  baseDir: string,
  serviceName: string,
  folderType: string,
  config: any,
  file: any,
  targetPath: string,
  deploy = false,
) {
  if (!file) {
    const error: any = new Error('No zip file provided');
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
    const error: any = new Error('File must be a zip archive');
    error.statusCode = 400;
    throw error;
  }

  let zip;
  try {
    zip = new AdmZip(file.buffer);
  } catch (error) {
    const err: any = new Error('Invalid or corrupted zip file');
    err.statusCode = 400;
    throw err;
  }

  const zipEntries = zip.getEntries();

  // Validate paths in zip
  for (const entry of zipEntries) {
    const entryPath = path.join(extractPath, entry.entryName);
    if (!entryPath.startsWith(extractPath)) {
      const error: any = new Error('Zip contains invalid paths (potential path traversal attack)');
      error.statusCode = 400;
      throw error;
    }
  }

  // Check file count
  if (zipEntries.length > 1000) {
    const error: any = new Error('Zip contains too many files (max 1000)');
    error.statusCode = 400;
    throw error;
  }

  // Check total size
  let totalSize = 0;
  const maxSize = 100 * 1024 * 1024; // 100MB
  for (const entry of zipEntries) {
    totalSize += entry.header.size;
    if (totalSize > maxSize) {
      const error: any = new Error('Zip uncompressed size exceeds limit (max 100MB)');
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
