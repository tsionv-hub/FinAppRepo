// Links to the guides in the repository. Worked out from the site address
// (https://USER.github.io/REPO/ → https://github.com/USER/REPO), so no
// username is written in the source. Elsewhere (localhost, other hosts) there is no link.

export function docsUrl(file: string, loc: { hostname: string; pathname: string } = location): string | null {
  if (!/\.github\.io$/i.test(loc.hostname)) return null;
  const user = loc.hostname.split('.')[0];
  const repo = loc.pathname.split('/').filter(Boolean)[0];
  if (!user || !repo) return null;
  return `https://github.com/${user}/${repo}/blob/main/docs/${file}`;
}
