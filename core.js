const {exec} = require('child_process');
const path = require('path');
const url = require('url');
const git = require('simple-git/promise')();
const axios = require('axios');
const log = require('./logger');

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN must be defined in environment');
}

if (!process.env.NOW_TOKEN) {
  throw new Error('NOW_TOKEN must be defined in environment');
}

const now = (cmd='') => {
  const nowBin = path.resolve('./node_modules/now/build/bin/now');
  return `${nowBin} ${cmd} --token ${process.env.NOW_TOKEN}`;
};

const githubApi = axios.create({
  headers: {
    'Authorization': `token ${process.env.GITHUB_TOKEN}`
  }
});

function stage(cwd, {alias}) {
  return new Promise((resolve, reject) => {
    const nowProc = exec(now(), {cwd});
    nowProc.stderr.on('data', (error) => reject(new Error(error)));
    nowProc.stdout.on('data', (url) => {
      if (!url) return;
      log.info(`> Aliasing ${url}`);
      const aliasProc = exec(now(`alias set ${url} ${alias}`), {cwd});
      aliasProc.on('data', (error) => reject(new Error(error)));
      aliasProc.on('close', (code) => {
        log.info(`> Alias ready ${alias}`);
        rmdir(cwd);
        resolve(alias);
      });
    });
  });
}

function sync(cloneUrl, localDirectory, {ref, checkout}) {
  // TODO: Avoid multiple request working on the same localDirectory
  // TODO: Silence the noise
  return git.clone(cloneUrl, localDirectory, ['--depth=1',`--branch=${ref}`])
  .then(() => git.cwd(localDirectory))
  .then(() => {
    log.info(`> Fetching origin#${ref}...`);
    return git.fetch('origin', ref);
  })
  .then(() => {
    log.info(`> Checking out ${ref}#${checkout}...`);
    return git.checkout(checkout);
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
    alias: `https://${repository.name.replace(/[^A-Z0-9]/ig, '-')}-${ref}.now.sh`,
    cloneUrl: url.format(Object.assign(
      url.parse(repository.clone_url),
      {auth: process.env.GITHUB_TOKEN}
    )),
    setStatus: (state, description, targetUrl) => {
      log.info(`> Setting GitHub status to "${state}"...`);
      return githubApi.post(pull_request.statuses_url, {
        state: state,
        target_url: targetUrl,
        description: description,
        context: 'ci/stage-ci'
      });
    }
  };
}

function rmdir(dir) {
  return new Promise((resolve) => {
    const rmProc = exec(`rm -r ${dir}`);

    rmProc.on('close', (code) => {
      resolve();
    });
  });
}

module.exports = {
  stage,
  sync,
  github
};
