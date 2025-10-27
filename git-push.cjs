const { execSync } = require('child_process');
const fs = require('fs');

// Remove lock file
try {
  if (fs.existsSync('.git/index.lock')) {
    fs.unlinkSync('.git/index.lock');
    console.log('Lock file removed');
  }
} catch (e) {
  console.log('Could not remove lock:', e.message);
}

// Git operations
try {
  execSync('git add -A', { stdio: 'inherit' });
  execSync('git commit -m "v16.1: Enhanced media ID detection with 6-layer fallback system"', { stdio: 'inherit' });
  execSync('git push origin main', { stdio: 'inherit' });
  console.log('Successfully pushed to GitHub!');
} catch (e) {
  console.log('Git operation failed:', e.message);
}