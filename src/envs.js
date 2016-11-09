module.exports = () => {
  const ENVS = process.env.ENVS;

  if (!ENVS) return '';

  let envs;
  try {
    envs = JSON.parse(ENVS);
  } catch (error) {
    return '';
  }

  const flags = Object.keys(envs)
  .map((key) => {
    if (/[^A-z0-9_]/i.test(key)) return;

    return `-e ${key}=${envs[key]}`;
  }).join(' ').trim();

  return flags;
};
