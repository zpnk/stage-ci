module.exports = () => {
  const ENVS = process.env.ENVS;

  if (!ENVS) return '';

  const envs = JSON.parse(ENVS);
  const flags = Object.keys(envs)
    .filter((key) => !/[^A-Z0-9_]/i.test(key))
    .map((key) => `-e ${key}=${envs[key]}`)
    .join(' ')
    .trim();

  return flags;
};
