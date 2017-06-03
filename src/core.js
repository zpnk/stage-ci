/* eslint-disable camelcase */
const {exec} = require('child_process');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const {fs} = require('mz');
const git = require('simple-git/promise')();
const axios = require('axios');
const log = require('./logger');
const envs = require('./envs');

if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN must be defined in environment. Create one at https://github.com/settings/tokens');
if (!process.env.GITHUB_WEBHOOK_SECRET) throw new Error('GITHUB_WEBHOOK_SECRET must be defined in environment. Create one at https://github.com/{OWNERNAME}/{REPONAME}/settings/hooks (swap in the path to your repo)');
if (!process.env.ZEIT_API_TOKEN) throw new Error('ZEIT_API_TOKEN must be defined in environment. Create one at https://zeit.co/account/tokens');

const now = (cmd='') => {
  const nowBin = path.resolve('./node_modules/now/build/bin/now');
  return `${nowBin} ${cmd} --token ${process.env.ZEIT_API_TOKEN}`;
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

function UnsafeWebhookPayloadError(language) {
  const asJson = {
    error: {
      type: 'fatal',
      name: 'UNSAFE_WEBHOOK_PAYLOAD',
      message: `We could not cryptograhpically verify the payload sent to the stage-ci webhook from ${language.provider.name}. Make sure your ${language.provider.name} environment variable matches the Secret field in your ${language.provider.name} webhook config ${language.provider.webhookLocationInstructions}.`
    }
  };
  this.message = asJson.error.message;
  this.name = asJson.error.name;
  this.asJson = asJson;
}

function github({headers, body}) {
  // Don't log but give a very specific error. We don't want to fill the logs.
  if (!isGithubRequestCrypographicallySafe({headers, body, secret: process.env.GITHUB_WEBHOOK_SECRET}))
    throw new UnsafeWebhookPayloadError({
      provider: {
        name: 'Github',
        environmentVariable: 'GITHUB_WEBHOOK_SECRET',
        webhookLocationInstructions: 'at https://github.com/{OWNERNAME}/{REPONAME}/settings/hooks (swap in the path to your repo)'
      }
    });

  if (!['opened', 'synchronize'].includes(body.action)) return {success: false};

  const {repository, pull_request} = body;
  const {ref, sha} = pull_request.head;
  const aliasID = `${repository.name.replace(/[^A-Z0-9]/gi, '-')}-pr${pull_request.number}`;

  return {
    ref,
    sha,
    success: true,
    name: repository.full_name,
    alias: `https://${aliasID}.now.sh`,
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

function isGithubRequestCrypographicallySafe({headers, body, secret}) {
  const blob = JSON.stringify(body);
  const hmac = crypto.createHmac('sha1', secret);
  const ourSignature = `sha1=${hmac.update(blob).digest('hex')}`;
  const theirSignature = headers['x-hub-signature'];
  const bufferA = Buffer.from(ourSignature, 'utf8');
  const bufferB = Buffer.from(theirSignature, 'utf8');
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = {
  stage,
  sync,
  github
};
