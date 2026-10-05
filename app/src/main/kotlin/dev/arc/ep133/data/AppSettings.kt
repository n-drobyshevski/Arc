package dev.arc.ep133.data

import android.content.Context
import androidx.core.content.edit
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.Scale
import dev.arc.ep133.text.ThemeChoice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The settings page's choices (an addition to the web version). */
data class AppSettings(
    val theme: ThemeChoice = ThemeChoice.SYSTEM,
    val autoConnect: Boolean = true,
    val keepScreenOn: Boolean = true,
    /** How many backups to keep; null keeps all. */
    val keepLast: Int? = null,
    /** Live shows one group at a time, large, instead of all four. */
    val liveOneGroup: Boolean = false,
    /** In that view, switch to the group of the pad just played. */
    val liveFollow: Boolean = true,
    /** The guide overlay has been shown once (it opens by itself on the first start only). */
    val guideSeen: Boolean = false,
    /** Live plays the keys (one sound as notes) instead of the pads. */
    val liveKeys: Boolean = false,
    /** KEYS: the key (0 = DO), the scale and the octave (4 starts at C4). */
    val keysRoot: Int = 0,
    val keysScale: Scale = Scale.CHROMATIC,
    val keysOctave: Int = 4,
)

/**
 * The settings, kept in the app's preferences and copied into library.json
 * (as "app.*") so they come back after a reinstall with the library.
 *
 * Only values that were chosen are stored (and copied out): a default is
 * never written, so a fresh install's library.json can't override the
 * choices an earlier install left in the folder.
 */
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    private fun read() = AppSettings(
        theme = runCatching { ThemeChoice.valueOf(prefs.getString("theme", null) ?: "") }.getOrDefault(ThemeChoice.SYSTEM),
        autoConnect = prefs.getBoolean("autoConnect", true),
        keepScreenOn = prefs.getBoolean("keepScreenOn", true),
        keepLast = prefs.getInt("keepLast", 0).takeIf { it > 0 },
        liveOneGroup = prefs.getBoolean("liveOneGroup", false),
        liveFollow = prefs.getBoolean("liveFollow", true),
        guideSeen = prefs.getBoolean("guideSeen", false),
        liveKeys = prefs.getBoolean("liveKeys", false),
        keysRoot = prefs.getInt("keysRoot", 0).coerceIn(0, 11),
        keysScale = runCatching { Scale.valueOf(prefs.getString("keysScale", null) ?: "") }.getOrDefault(Scale.CHROMATIC),
        keysOctave = prefs.getInt("keysOctave", 4).coerceIn(Keys.MIN_OCTAVE, Keys.MAX_OCTAVE),
    )

    /** Each setting as its key and stored text. */
    private fun AppSettings.values(): Map<String, String> = linkedMapOf(
        "theme" to theme.name,
        "autoConnect" to autoConnect.toString(),
        "keepScreenOn" to keepScreenOn.toString(),
        "keepLast" to (keepLast ?: 0).toString(),
        "liveOneGroup" to liveOneGroup.toString(),
        "liveFollow" to liveFollow.toString(),
        "guideSeen" to guideSeen.toString(),
        "liveKeys" to liveKeys.toString(),
        "keysRoot" to keysRoot.toString(),
        "keysScale" to keysScale.name,
        "keysOctave" to keysOctave.toString(),
    )

    fun update(change: (AppSettings) -> AppSettings) {
        val cur = _settings.value
        val next = change(cur)
        val before = cur.values()
        val changed = next.values().filter { (k, v) -> before[k] != v }
        if (changed.isEmpty()) return
        prefs.edit {
            for ((k, v) in changed) {
                when (k) {
                    "theme", "keysScale" -> putString(k, v)
                    "keepLast", "keysRoot", "keysOctave" -> putInt(k, v.toInt())
                    else -> putBoolean(k, v.toBooleanStrict())
                }
            }
        }
        _settings.value = next
    }

    /** As stored in library.json: only the settings that were chosen. */
    fun toIndex(): Map<String, String> =
        _settings.value.values().filterKeys { prefs.contains(it) }.mapKeys { "app." + it.key }

    /** Takes back what library.json held; anything missing or unreadable stays as it is. */
    fun fromIndex(map: Map<String, String>) = update { cur ->
        cur.copy(
            theme = map["app.theme"]?.let { v -> runCatching { ThemeChoice.valueOf(v) }.getOrNull() } ?: cur.theme,
            autoConnect = map["app.autoConnect"]?.toBooleanStrictOrNull() ?: cur.autoConnect,
            keepScreenOn = map["app.keepScreenOn"]?.toBooleanStrictOrNull() ?: cur.keepScreenOn,
            keepLast = map["app.keepLast"]?.toIntOrNull()?.let { n -> n.takeIf { it > 0 } } ?: if (map.containsKey("app.keepLast")) null else cur.keepLast,
            liveOneGroup = map["app.liveOneGroup"]?.toBooleanStrictOrNull() ?: cur.liveOneGroup,
            liveFollow = map["app.liveFollow"]?.toBooleanStrictOrNull() ?: cur.liveFollow,
            guideSeen = map["app.guideSeen"]?.toBooleanStrictOrNull() ?: cur.guideSeen,
            liveKeys = map["app.liveKeys"]?.toBooleanStrictOrNull() ?: cur.liveKeys,
            keysRoot = map["app.keysRoot"]?.toIntOrNull()?.takeIf { it in 0..11 } ?: cur.keysRoot,
            keysScale = map["app.keysScale"]?.let { v -> runCatching { Scale.valueOf(v) }.getOrNull() } ?: cur.keysScale,
            keysOctave = map["app.keysOctave"]?.toIntOrNull()?.takeIf { it in Keys.MIN_OCTAVE..Keys.MAX_OCTAVE } ?: cur.keysOctave,
        )
    }
}
