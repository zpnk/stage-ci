const {exec} = require('child_process');

function stage(cwd, {alias}) {
  return new Promise((resolve) => {
    const nowProc = exec(`now`, {cwd});
    nowProc.stdout.on('data', (url) => {
      if (!url) return;
      console.log(`> Aliasing ${url}`);
      const aliasProc = exec(`now alias set ${url} ${alias}`, {cwd});
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
