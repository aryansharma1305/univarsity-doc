import { isNavActive, type AdminNavItem } from './nav';

export function activeNavHref(
  pathname: string,
  items: readonly AdminNavItem[],
  searchParams: URLSearchParams = new URLSearchParams(),
) {
  return items
    .filter(({ href }) => {
      const [path, query] = href.split('?');
      if (!path || !isNavActive(pathname, path)) return false;
      if (!query) return true;
      return (
        pathname === path &&
        [...new URLSearchParams(query)].every(([key, value]) => searchParams.get(key) === value)
      );
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
