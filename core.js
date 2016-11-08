const {exec} = require('child_process');
const path = require('path');
const url = require('url');
const git = require('simple-git')();
const axios = require('axios');

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN must be defined in environment');
}

if (!process.env.NOW_TOKEN) {
  throw new Error('NOW_TOKEN must be defined in environment');
}

const NOW = `${path.resolve('./node_modules/now/build/bin/now')} --token ${process.env.NOW_TOKEN}`;
const githubApi = axios.create({
  headers: {
    'Authorization': `token ${process.env.GITHUB_TOKEN}`
  }
});

function stage(cwd, {alias}) {
  return new Promise((resolve, reject) => {
    const nowProc = exec(NOW, {cwd});
    nowProc.stderr.on('data', (error) => reject(new Error(error)));
    nowProc.stdout.on('data', (url) => {
      if (!url) return;
      console.log(`> Aliasing ${url}`);
      const aliasProc = exec(`${NOW} alias set ${url} ${alias}`, {cwd});
      aliasProc.on('data', (error) => reject(new Error(error)));
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

function github(data) {
  if (!['opened', 'synchronize'].includes(data.action)) return {success: false};

  const {repository, pull_request} = data;
  const {ref, sha} = pull_request.head;

  return {
    ref,
    sha,
    success: true,
    name: repository.full_name,
    alias: `https://${repository.name}-${ref}.now.sh`,
    cloneUrl: url.format(Object.assign(
      url.parse(repository.clone_url),
      {auth: process.env.GITHUB_TOKEN}
    )),
    setStatus: (state, description, targetUrl) => {
      console.log(`> Setting GitHub status to "${state}"...`);
      return githubApi.post(pull_request.statuses_url, {
        state: state,
        target_url: targetUrl,
        description: description,
        context: 'ci/stage-ci'
      });
    }
  };
}

module.exports = {
  stage,
  sync,
  github
};
