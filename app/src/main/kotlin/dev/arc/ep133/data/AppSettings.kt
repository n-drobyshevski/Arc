package dev.arc.ep133.data

import android.content.Context
import androidx.core.content.edit
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.Scale
import dev.arc.ep133.features.Tour
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
    /** KEYS names notes in solfège (DO RE MI) or letters (C D E). */
    val keysNames: NoteNames = NoteNames.SOLFEGE,
    /** "Try arc": the steps done and skipped so far (Tour.encode); empty before the first. */
    val tourSteps: String = "",
    /** "Try arc" was finished or put off with Not now: it no longer opens by itself. */
    val tourDone: Boolean = false,
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
        keysNames = runCatching { NoteNames.valueOf(prefs.getString("keysNames", null) ?: "") }.getOrDefault(NoteNames.SOLFEGE),
        tourSteps = prefs.getString("tourSteps", null) ?: "",
        tourDone = prefs.getBoolean("tourDone", false),
    )

    /** Saves what [change] changed; returns whether anything did. */
    fun update(change: (AppSettings) -> AppSettings): Boolean {
        val cur = _settings.value
        val next = change(cur)
        val before = values(cur)
        val changed = values(next).filter { (k, v) -> before[k] != v }
        if (changed.isEmpty()) return false
        prefs.edit {
            for ((k, v) in changed) {
                when (kind(k)) {
                    Kind.STRING -> putString(k, v)
                    Kind.INT -> putInt(k, v.toInt())
                    Kind.BOOLEAN -> putBoolean(k, v.toBooleanStrict())
                }
            }
        }
        _settings.value = next
        return true
    }

    /**
     * Forgets a stored setting: its key leaves the preferences (and so
     * library.json), and the setting goes back to its default.
     */
    fun clear(key: String) {
        kind(key)
        prefs.edit { remove(key) }
        _settings.value = read()
    }

    /** As stored in library.json: only the settings that were chosen. */
    fun toIndex(): Map<String, String> =
        values(_settings.value).filterKeys { prefs.contains(it) }.mapKeys { "app." + it.key }

    /** Takes back what library.json held; anything missing or unreadable stays as it is. */
    fun fromIndex(map: Map<String, String>) = update { readIndex(it, map) }

    /** How each setting is stored in the preferences. */
    enum class Kind { STRING, INT, BOOLEAN }

    companion object {
        /** Every setting's key and how it is stored; [values] and this list the same keys. */
        val KINDS: Map<String, Kind> = linkedMapOf(
            "theme" to Kind.STRING,
            "autoConnect" to Kind.BOOLEAN,
            "keepScreenOn" to Kind.BOOLEAN,
            "keepLast" to Kind.INT,
            "liveOneGroup" to Kind.BOOLEAN,
            "liveFollow" to Kind.BOOLEAN,
            "guideSeen" to Kind.BOOLEAN,
            "liveKeys" to Kind.BOOLEAN,
            "keysRoot" to Kind.INT,
            "keysScale" to Kind.STRING,
            "keysOctave" to Kind.INT,
            "keysNames" to Kind.STRING,
            "tourSteps" to Kind.STRING,
            "tourDone" to Kind.BOOLEAN,
        )

        /** A key without a kind is a mistake: it fails loudly rather than being saved as the wrong type. */
        fun kind(key: String): Kind = KINDS[key] ?: throw IllegalArgumentException("unknown setting: $key")

        /** [cur] with what library.json ([map], "app.*") held; anything missing or unreadable stays as it is. */
        fun readIndex(cur: AppSettings, map: Map<String, String>): AppSettings =
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
                keysNames = map["app.keysNames"]?.let { v -> runCatching { NoteNames.valueOf(v) }.getOrNull() } ?: cur.keysNames,
                // Taken as it is when it reads as the tour's progress (LibraryIndex.merge joined the folder's copies).
                tourSteps = map["app.tourSteps"]?.takeIf { v -> Tour.encode(Tour.decode(v)) == v } ?: cur.tourSteps,
                tourDone = map["app.tourDone"]?.toBooleanStrictOrNull() ?: cur.tourDone,
            )

        /** Each setting as its key and stored text. */
        fun values(s: AppSettings): Map<String, String> = linkedMapOf(
            "theme" to s.theme.name,
            "autoConnect" to s.autoConnect.toString(),
            "keepScreenOn" to s.keepScreenOn.toString(),
            "keepLast" to (s.keepLast ?: 0).toString(),
            "liveOneGroup" to s.liveOneGroup.toString(),
            "liveFollow" to s.liveFollow.toString(),
            "guideSeen" to s.guideSeen.toString(),
            "liveKeys" to s.liveKeys.toString(),
            "keysRoot" to s.keysRoot.toString(),
            "keysScale" to s.keysScale.name,
            "keysOctave" to s.keysOctave.toString(),
            "keysNames" to s.keysNames.name,
            "tourSteps" to s.tourSteps,
            "tourDone" to s.tourDone.toString(),
        )
    }
}
