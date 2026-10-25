// Builds the guide view (views/guide) into one self-contained HTML file,
// ui-dist/guide.html, as vite.config.ts builds the beat-card view; it runs
// second in `npm run build:views` and leaves ui-dist's beat.html in place.
import { defineConfig } from 'vite'
import { viewConfig } from './vite.config.ts'

export default defineConfig(viewConfig('guide', false))
