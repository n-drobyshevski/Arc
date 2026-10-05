// Port of app/src/main/kotlin/dev/arc/ep133/ui/theme/ArcTheme.kt (val Manrope)
//
// Manrope, self-hosted from @fontsource so the PWA works offline. The weights are
// the ones ArcTheme.kt bundles (res/font/manrope_400..800): Normal, Medium,
// SemiBold, Bold, ExtraBold. Each CSS file declares every subset with a
// unicode-range, so the browser only downloads the subsets a page uses.
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'

/** The weights loaded above, as ArcType uses them. */
export const MANROPE_WEIGHTS = [400, 500, 600, 700, 800] as const
