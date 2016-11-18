/* eslint-disable camelcase */
const {exec} = require('child_process');
const path = require('path');
const url = require('url');
const {fs} = require('mz');
const git = require('simple-git/promise')();
const axios = require('axios');
const log = require('./logger');
const envs = require('./envs');

if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN must be defined in environment');
if (!process.env.NOW_TOKEN) throw new Error('NOW_TOKEN must be defined in environment');

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
    let url, aliasError;
    const nowProc = exec(now(envs()), {cwd});
    nowProc.stderr.on('data', (error) => reject(new Error(error)));
    nowProc.stdout.on('data', (data) => {if (!url) url = data;});
    nowProc.stdout.on('close', () => {
      if (!url) return reject(new Error('Deployment failed'));
      log.info(`> Setting ${url} to alias ${alias}`);
      const aliasProc = exec(now(`alias set ${url} ${alias}`), {cwd});
      aliasProc.stderr.on('data', (error) => {aliasError = error;});
      aliasProc.on('close', () => {
        if (aliasError) return reject(new Error(aliasError));
        log.info(`> Alias ready ${alias}`);
        resolve(alias);
      });
    });
  });
}

async function sync(cloneUrl, localDirectory, {ref, checkout}) {
  try {
    await fs.stat(localDirectory);
  } catch (error) {
    log.info('> Cloning repository...');
    await git.clone(cloneUrl, localDirectory, ['--depth=1', `--branch=${ref}`]);
  }

  await git.cwd(localDirectory);
  log.info(`> Fetching ${ref}...`);
  await git.fetch('origin', ref);
  log.info(`> Checking out ${ref}@${checkout}...`);
  await git.checkout(checkout);
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
        state,
        description,
        target_url: targetUrl,
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
