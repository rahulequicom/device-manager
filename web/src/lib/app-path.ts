// Public project sites (such as GitHub Pages) serve this app under a subpath.
export function appPath(path: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
}
