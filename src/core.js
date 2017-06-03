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

const env = process.env;

const INVALID_URI_CHARACTERS = /\//g;

if (!((env.GITHUB_TOKEN && !env.GITLAB_TOKEN) || (!env.GITHUB_TOKEN && env.GITLAB_TOKEN))) throw new Error('One of GITHUB_TOKEN or GITLAB_TOKEN must be defined in environment. Create one at https://github.com/settings/tokens or https://gitlab.com/profile/personal_access_tokens');
if (!((env.GITHUB_WEBHOOK_SECRET && !env.GITLAB_WEBHOOK_SECRET) || (!env.GITHUB_WEBHOOK_SECRET && env.GITLAB_WEBHOOK_SECRET))) throw new Error('One of GITHUB_WEBHOOK_SECRET or GITLAB_WEBHOOK_SECRET must be defined in environment. Create one at https://github.com/{OWNERNAME}/{REPONAME}/settings/hooks or https://gitlab.com/{OWNERNAME}/{REPONAME}/settings/integration (swap in the path to your repo)');
if (!env.ZEIT_API_TOKEN) throw new Error('ZEIT_API_TOKEN must be defined in environment. Create one at https://zeit.co/account/tokens');

const now = (cmd='') => {
  const nowBin = path.resolve('./node_modules/now/build/bin/now');
  return `${nowBin} ${cmd} --token ${env.ZEIT_API_TOKEN}`;
};

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
  if (!isGithubRequestCrypographicallySafe({headers, body, secret: env.GITHUB_WEBHOOK_SECRET}))
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

  const githubApi = axios.create({
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`
    }
  });

  return {
    ref,
    sha,
    success: true,
    name: repository.full_name,
    alias: `https://${repository.name.replace(/[^A-Z0-9]/ig, '-')}-${ref.replace(INVALID_URI_CHARACTERS, '-')}.now.sh`,
    cloneUrl: url.format(Object.assign(
      url.parse(repository.clone_url),
      {auth: env.GITHUB_TOKEN}
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

function gitlab({headers, body} = {}) {
  if (!isGitLabRequestSafe({headers}))
    throw new UnsafeWebhookPayloadError({
      provider: {
        name: 'Gitlab',
        environmentVariable: 'GITLAB_WEBHOOK_SECRET',
        webhookLocationInstructions: 'at https://gitlab.com/{OWNERNAME}/{REPONAME}/settings/integrations (swap in the path to your repo)'
      }
    });

  if (body.object_kind !== 'merge_request') return {success: false};
  if (!['opened', 'reopened'].includes(body.object_attributes.state)) return {success: false};

  const {object_attributes: {source, source_branch, last_commit: {id}, target, target_project_id}} = body;

  let {web_url} = source;
  web_url = url.parse(web_url);
  const statuses_url = `${web_url.protocol}//${web_url.hostname}/api/v4/projects/${target_project_id}/statuses/${id}`;

  const gitlabApi = axios.create({
    headers: {
      'PRIVATE-TOKEN': env.GITLAB_TOKEN
    }
  });

  return {
    ref: source_branch,
    sha: id,
    success: true,
    name: target.path_with_namespace,
    alias: `https://${source.name.replace(/[^A-Z0-9]/ig, '-')}-${source_branch.replace(INVALID_URI_CHARACTERS, '-')}.now.sh`,
    cloneUrl: url.format(Object.assign(
      url.parse(source.http_url),
      {auth: `gitlab-ci-token:${env.GITLAB_TOKEN}`}
    )),
    setStatus: (state, description, targetUrl) => {
      log.info(`> Setting GitLab status to "${state}"...`);
      return gitlabApi.post(statuses_url, {
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

function isGitLabRequestSafe({headers}) {
  return headers['x-gitlab-token'] === env.GITLAB_WEBHOOK_SECRET;
}

module.exports = {
  stage,
  sync,
  github,
  gitlab
};
