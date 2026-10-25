// Builds the groove gallery view (views/grooves) into one self-contained HTML
// file, ui-dist/grooves.html, as vite.config.ts builds the beat-card view; it
// runs third in `npm run build:views` and leaves ui-dist's other views in
// place. The gallery plays its grooves with the beat view's model, player and
// synth (views/beat), bundled in like any other import.
import { defineConfig } from 'vite'
import { viewConfig } from './vite.config.ts'

export default defineConfig(viewConfig('grooves', false))
