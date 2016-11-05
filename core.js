const path = require('path');
const {exec} = require('child_process');

const NOW = path.resolve('./node_modules/now/build/bin/now');

function stage(cwd, {alias}) {
  return new Promise((resolve) => {
    const nowProc = exec(NOW, {cwd});
    nowProc.stdout.on('data', (url) => {
      if (!url) return;
      console.log(`> Aliasing ${url}`);
      const aliasProc = exec(`${NOW} alias set ${url} ${alias}`, {cwd});
      aliasProc.on('close', (code) => {
        console.log(`> Ready! ${alias}`);
        resolve(alias);
      });
    });
  });
}

module.exports = {
  stage
};
