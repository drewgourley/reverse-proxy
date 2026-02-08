"use strict";

const { exec } = require('child_process');

/**
 * Get git repository status
 * @returns {Promise<Object>} Git status information
 */
function getGitStatus() {
  return new Promise((resolve, reject) => {
    exec('git rev-parse --abbrev-ref HEAD', { windowsHide: true }, (branchError, branchOut) => {
      if (branchError) {
        return reject(new Error('Not a git repository or git not available'));
      }
      
      const branch = branchOut.trim();
      
      exec('git rev-parse --short HEAD', { windowsHide: true }, (commitError, commitOut) => {
        if (commitError) {
          return reject(new Error('Could not get commit hash'));
        }
        
        const commit = commitOut.trim();
        
        exec('git log -1 --format=%s', { windowsHide: true }, (messageError, messageOut) => {
          const message = messageError ? '' : messageOut.trim();
          
          exec('git log -1 --format=%ct', { windowsHide: true }, (timestampError, timestampOut) => {
            let version = 'Unknown';
            if (!timestampError && timestampOut.trim()) {
              const timestamp = parseInt(timestampOut.trim()) * 1000;
              const d = new Date(timestamp);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const hours = String(d.getHours()).padStart(2, '0');
              const minutes = String(d.getMinutes()).padStart(2, '0');
              version = `${year}.${month}.${day}.${hours}${minutes}`;
            }
            
            resolve({ branch, commit, message, version });
          });
        });
      });
    });
  });
}

/**
 * Check if updates are available from remote
 * @returns {Promise<Object>} Update availability information
 */
function checkForUpdates() {
  return new Promise((resolve, reject) => {
    exec('git fetch origin', { windowsHide: true }, (fetchError) => {
      if (fetchError) {
        return reject(new Error('Could not fetch from origin'));
      }
      
      exec('git rev-parse HEAD', { windowsHide: true }, (localError, localOut) => {
        if (localError) {
          return reject(new Error('Could not get local commit'));
        }
        
        const localCommit = localOut.trim();
        
        exec('git rev-parse @{u}', { windowsHide: true }, (remoteError, remoteOut) => {
          if (remoteError) {
            return resolve({ 
              updatesAvailable: false, 
              message: 'No upstream branch configured' 
            });
          }
          
          const remoteCommit = remoteOut.trim();
          const updatesAvailable = localCommit !== remoteCommit;
          
          if (updatesAvailable) {
            resolve({
              updatesAvailable: true,
              message: 'Update Available'
            });
          } else {
            resolve({
              updatesAvailable: false,
              message: 'Already up to date'
            });
          }
        });
      });
    });
  });
}

/**
 * Pull latest changes from git and optionally install dependencies
 * @returns {Promise<Object>} Pull result
 */
function pullChanges() {
  const now = new Date().toISOString();
  console.log(`${now}: Pulling latest changes from git...`);
  return new Promise((resolve, reject) => {
    exec('git pull origin', { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || error.message));
      }
      
      const needsDependencies = stdout.includes('package.json') || stdout.includes('package-lock.json');
      
      const now = new Date().toISOString();
      if (needsDependencies) {
        console.log(`${now}: Changes detected in package.json or package-lock.json, installing dependencies...`);
        exec('npm install', { windowsHide: true }, (npmError, npmStdout, npmStderr) => {
          if (npmError) {
            return reject(new Error(`Update succeeded but dependency install failed: ${npmStderr || npmError.message}`));
          }
          resolve({ output: stdout, installedDependencies: true });
        });
      } else {
        console.log(`${now}: No dependency changes detected.`);
        resolve({ output: stdout, installedDependencies: false });
      }
    });
  });
}

/**
 * Force reset to remote origin and install dependencies
 * @returns {Promise<Object>} Reset result
 */
function forceReset() {
  return new Promise((resolve, reject) => {
    exec('git reset --hard origin', { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || error.message));
      }
      
      exec('npm install', { windowsHide: true }, (npmError, npmStdout, npmStderr) => {
        if (npmError) {
          return reject(new Error(`Update succeeded but dependency install failed: ${npmStderr || npmError.message}`));
        }
        resolve({ output: stdout });
      });
    });
  });
}

module.exports = {
  getGitStatus,
  checkForUpdates,
  pullChanges,
  forceReset
};
