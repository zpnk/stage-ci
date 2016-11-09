import test from 'ava';
import envs from '../src/envs'

test('empty', (t) => {
  delete process.env.ENVS;
  t.is(envs(), '');
});

test('bad json', (t) => {
  process.env.ENVS = '{"REDIS_HOST": my.cache.aws.com // hmm}';
  t.is(envs(), '');
});

test('basic envar key validation', (t) => {
  process.env.ENVS = `{
    "red!s-host": "my.cache.aws.com",
    "redis_port": 1234
  }`;
  t.is(envs(), '-e redis_port=1234');
});

test('single flag', (t) => {
  process.env.ENVS = '{"REDIS_HOST": "my.cache.aws.com"}';
  t.is(envs(), '-e REDIS_HOST=my.cache.aws.com');
});

test('multiple flags', (t) => {
  process.env.ENVS = `{
    "REDIS_HOST": "my.cache.aws.com",
    "REDIS_PORT": "1234"
  }`;
  t.is(envs(), '-e REDIS_HOST=my.cache.aws.com -e REDIS_PORT=1234');
});
