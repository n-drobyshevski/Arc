// The guide view as one HTML file: views/guide built by Vite with
// vite-plugin-singlefile into ui-dist/guide.html (`npm run build:views`),
// inlined here as a string when the server is bundled (and when vitest loads
// it), as beatHtml.ts does for the beat-card view.

import html from '../ui-dist/guide.html?raw'

export const GUIDE_HTML: string = html
