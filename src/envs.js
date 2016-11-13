module.exports = () => {
  const ENVS = process.env.ENVS;

  if (!ENVS) return '';

  const envs = JSON.parse(ENVS);

  const flags = Object.keys(envs)
  .map((key) => {
    if (/[^A-z0-9_]/i.test(key)) return;

    return `-e ${key}="${envs[key]}"`;
  }).join(' ').trim();

  return flags;
};
