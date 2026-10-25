// The beat-card view as one HTML file: views/beat built by Vite with
// vite-plugin-singlefile into ui-dist/beat.html (`npm run build:views`),
// inlined here as a string when the server is bundled (and when vitest loads
// it), so the function reads no files at run time.

import html from '../ui-dist/beat.html?raw'

export const BEAT_HTML: string = html
