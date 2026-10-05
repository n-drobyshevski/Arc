// Port of core/src/main/kotlin/dev/arc/ep133/Arc.kt and the generated ArcVersion.
// The version comes from ../version.properties at build time (vite.config.ts).
export const APP_NAME = 'arc'
export const APP_VERSION: string = typeof __ARC_VERSION__ === 'string' ? __ARC_VERSION__ : '0.0.0'
export const APP_BUILD: string = typeof __ARC_BUILD__ === 'string' ? __ARC_BUILD__ : `${APP_VERSION}-dev`
/** Written into meta.json "author" of every .pak, without the -dev part. */
export const PAK_AUTHOR = `${APP_NAME} ${APP_VERSION}`
