const {exec} = require('child_process');
const path = require('path');
const git = require('simple-git')();
const axios = require('axios');

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN must be defined in environment');
}

const STATUS_CONTEXT = 'ci/stage-ci';
const NOW = path.resolve('./node_modules/now/build/bin/now');

const githubApi = axios.create({
  headers: {
    'Authorization': `token ${process.env.GITHUB_TOKEN}`
  }
});

function stage(cwd, {alias}) {
  return new Promise((resolve) => {
    const nowProc = exec(NOW, {cwd});
    nowProc.stdout.on('data', (url) => {
      if (!url) return;
      console.log(`> Aliasing ${url}`);
      const aliasProc = exec(`${NOW} alias set ${url} ${alias}`, {cwd});
      aliasProc.on('close', (code) => {
        console.log(`> Alias ready ${alias}`);
        resolve(alias);
      });
    });
  });
}

function sync(cloneUrl, localDirectory, {ref, checkout}) {
  // TODO: Avoid multiple request working on the same localDirectory
  return new Promise((resolve) => {
    console.log(`> Cloning ${cloneUrl}#${ref}...`);
    git.clone(cloneUrl, localDirectory, [ // TODO: Silence the noise
      '--depth=1',
      `--branch=${ref}`
    ], () => {
      console.log(`> Checking out ${ref}#${checkout}...`);
      git.cwd(localDirectory)
        .fetch('origin', ref)
        .checkout(checkout)
        .then(resolve);
    });
  });
}

function createStatusSetter(data) {
  if (data.pull_request.statuses_url) {
    return function githubStatusSetter(state, description, targetUrl) {
      console.log(`> Setting GitHub status to "${state}"...`);
      return githubApi.post(data.pull_request.statuses_url, {
        state: state,
        target_url: targetUrl,
        description: description,
        context: STATUS_CONTEXT
      });
    }
  }

  return function noopStatusSetter() {
    console.log(`> Skipped status update`);
  }
}

module.exports = {
  stage,
  sync,
  createStatusSetter
};
