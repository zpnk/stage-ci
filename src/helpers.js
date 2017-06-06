const INVALID_URI_CHARACTERS = /\//g;

exports.createAliasUrl = (repo, ref) => {
  const repoStripped = repo.replace(/[^A-Z0-9]/ig, '-');
  const refStripped = ref.replace(INVALID_URI_CHARACTERS, '-');
  return `https://${repoStripped}-${refStripped}.now.sh`;
};
