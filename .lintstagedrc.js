/**
 * lint-staged appends matched filenames to string commands. These commands run
 * project-wide checks, so return them from functions to keep their arguments
 * empty (in particular, `tsc -b` does not accept source-file paths).
 */
const withoutFilenames = (command) => () => command

module.exports = {
  'web/src/**/*.{ts,tsx}': [
    withoutFilenames('pnpm typecheck'),
    withoutFilenames('pnpm test'),
  ],
  'web/**/*.json': [withoutFilenames('pnpm test')],
}
