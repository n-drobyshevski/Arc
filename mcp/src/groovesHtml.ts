// The groove gallery view as one HTML file: views/grooves built by Vite with
// vite-plugin-singlefile into ui-dist/grooves.html (`npm run build:views`),
// inlined here as a string when the server is bundled (and when vitest loads
// it), as beatHtml.ts does for the beat-card view.

import html from '../ui-dist/grooves.html?raw'

export const GROOVES_HTML: string = html
