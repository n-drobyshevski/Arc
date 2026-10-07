package dev.arc.ep133.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.KeysView
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.Piano
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.Scale
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.text.LiveEngine
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
    val liveOneGroup: Boolean = true,
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
    /** KEYS writes each key's note name in its ring (off: rings and octave numbers only). */
    val keysShowNames: Boolean = true,
    /** KEYS on the grid or the piano, remembered once for a wide window and once for a tall one. */
    val keysViewWide: KeysView = KeysView.AUTO,
    val keysViewTall: KeysView = KeysView.AUTO,
    /** The piano's white keys (Piano.WHITES); null is Auto, the widest that fits. */
    val pianoWhites: Int? = null,
    /** A light tick when a pad or key is pressed in Live (the phone's own touch feedback setting still applies). */
    val haptics: Boolean = true,
    /** Live's click (TEMPO): the phone's tempo in BPM, Tempo.MIN..MAX. The click itself always starts off. */
    val liveTempo: Int = Tempo.DEFAULT,
    /**
     * Which output Live plays through, a debug choice for the latency test
     * (Debug screen): kept on this phone only, never copied into library.json.
     */
    val liveEngine: LiveEngine = LiveEngine.AUTO,
    /** SAMPLE's input (an addition): its source and whether it records in stereo. */
    val sampleSource: SampleSource = SampleSource.MIC,
    val sampleStereo: Boolean = false,
    /** SAMPLE's LEVEL per source, in dB: the phone's mic is quiet, so it starts higher. */
    val sampleGainMic: Float = SAMPLE_GAIN_MIC,
    val sampleGainRsp: Float = 0f,
    val sampleGainUsb: Float = 0f,
    /** SAMPLE's threshold in dBFS; null records from the press. */
    val sampleThreshold: Float? = null,
    /** The bars a hands-free take lasts, after a bar's count-in; null (Free) runs until SAMPLE is tapped. */
    val sampleBars: Int? = null,
    /** A take opens the review sheet before it goes on its pad (off: straight on, as on the EP-133). */
    val reviewSamples: Boolean = true,
    /** The review's switches, kept for the next take (and used as they are with [reviewSamples] off). */
    val sampleNormalize: Boolean = false,
    val sampleTrimSilence: Boolean = false,
) {
    /** SAMPLE's LEVEL for [source], in dB. */
    fun sampleGain(source: SampleSource): Float = when (source) {
        SampleSource.MIC -> sampleGainMic
        SampleSource.RSP -> sampleGainRsp
        SampleSource.USB -> sampleGainUsb
    }

    /** These settings with SAMPLE's LEVEL for [source] at [db]. */
    fun withSampleGain(source: SampleSource, db: Float): AppSettings = when (source) {
        SampleSource.MIC -> copy(sampleGainMic = db)
        SampleSource.RSP -> copy(sampleGainRsp = db)
        SampleSource.USB -> copy(sampleGainUsb = db)
    }
}

/** SAMPLE's LEVEL for the phone's mic until one is chosen, in dB. */
const val SAMPLE_GAIN_MIC = 12f

/** The LEVEL knob's range, in dB, as SAMPLE's strip turns it. */
val SAMPLE_GAINS = -12f..30f

/** The threshold knob's range in dBFS, below Off. */
val SAMPLE_THRESHOLDS = -60f..0f

/** BARS' choices for a hands-free take: Free (null), then these. */
val SAMPLE_BARS = listOf(1, 2, 4, 8, 16)

/**
 * The settings, kept in the app's preferences and copied into library.json
 * (as "app.*") so they come back after a reinstall with the library.
 *
 * Only values that were chosen are stored (and copied out): a default is
 * never written, so a fresh install's library.json can't override the
 * choices an earlier install left in the folder. The debug screen's engine
 * choice ([AppSettings.liveEngine]) stays in the preferences alone.
 */
class SettingsStore internal constructor(private val prefs: SharedPreferences) {
    constructor(context: Context) : this(context.getSharedPreferences("settings", Context.MODE_PRIVATE))

    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    private fun read() = AppSettings(
        theme = runCatching { ThemeChoice.valueOf(prefs.getString("theme", null) ?: "") }.getOrDefault(ThemeChoice.SYSTEM),
        autoConnect = prefs.getBoolean("autoConnect", true),
        keepScreenOn = prefs.getBoolean("keepScreenOn", true),
        keepLast = prefs.getInt("keepLast", 0).takeIf { it > 0 },
        liveOneGroup = prefs.getBoolean("liveOneGroup", true),
        liveFollow = prefs.getBoolean("liveFollow", true),
        guideSeen = prefs.getBoolean("guideSeen", false),
        liveKeys = prefs.getBoolean("liveKeys", false),
        keysRoot = prefs.getInt("keysRoot", 0).coerceIn(0, 11),
        keysScale = runCatching { Scale.valueOf(prefs.getString("keysScale", null) ?: "") }.getOrDefault(Scale.CHROMATIC),
        keysOctave = prefs.getInt("keysOctave", 4).coerceIn(Keys.MIN_OCTAVE, Keys.MAX_OCTAVE),
        keysNames = runCatching { NoteNames.valueOf(prefs.getString("keysNames", null) ?: "") }.getOrDefault(NoteNames.SOLFEGE),
        keysShowNames = prefs.getBoolean("keysShowNames", true),
        keysViewWide = runCatching { KeysView.valueOf(prefs.getString("keysViewWide", null) ?: "") }.getOrDefault(KeysView.AUTO),
        keysViewTall = runCatching { KeysView.valueOf(prefs.getString("keysViewTall", null) ?: "") }.getOrDefault(KeysView.AUTO),
        pianoWhites = Piano.choiceOf(prefs.getInt("pianoWhites", 0)),
        haptics = prefs.getBoolean("haptics", true),
        liveTempo = Tempo.clamp(prefs.getInt("liveTempo", Tempo.DEFAULT)),
        liveEngine = liveEngineOf(prefs.getString(LIVE_ENGINE, null)),
        sampleSource = SampleSource.of(prefs.getString("sampleSource", null) ?: "") ?: SampleSource.MIC,
        sampleStereo = prefs.getBoolean("sampleStereo", false),
        sampleGainMic = sampleGainOf(prefs.getFloat("sampleGainMic", SAMPLE_GAIN_MIC)) ?: SAMPLE_GAIN_MIC,
        sampleGainRsp = sampleGainOf(prefs.getFloat("sampleGainRsp", 0f)) ?: 0f,
        sampleGainUsb = sampleGainOf(prefs.getFloat("sampleGainUsb", 0f)) ?: 0f,
        sampleThreshold = sampleThresholdOf(prefs.getString("sampleThreshold", null)),
        sampleBars = prefs.getInt("sampleBars", 0).takeIf { it in SAMPLE_BARS },
        reviewSamples = prefs.getBoolean("reviewSamples", true),
        sampleNormalize = prefs.getBoolean("sampleNormalize", false),
        sampleTrimSilence = prefs.getBoolean("sampleTrimSilence", false),
    )

    fun update(change: (AppSettings) -> AppSettings) {
        val cur = _settings.value
        val next = change(cur)
        val before = cur.values()
        val changed = next.values().filter { (k, v) -> before[k] != v }
        val engine = next.liveEngine != cur.liveEngine
        if (changed.isEmpty() && !engine) return
        prefs.edit {
            // Not one of [values]: not in library.json. The default isn't kept either.
            if (engine) {
                if (next.liveEngine == LiveEngine.AUTO) remove(LIVE_ENGINE) else putString(LIVE_ENGINE, next.liveEngine.name)
            }
            for ((k, v) in changed) {
                when (k) {
                    "theme", "keysScale", "keysNames", "keysViewWide", "keysViewTall", "sampleSource", "sampleThreshold" -> putString(k, v)
                    "keepLast", "keysRoot", "keysOctave", "pianoWhites", "liveTempo", "sampleBars" -> putInt(k, v.toInt())
                    "sampleGainMic", "sampleGainRsp", "sampleGainUsb" -> putFloat(k, v.toFloat())
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
    fun fromIndex(map: Map<String, String>) = update { it.withIndex(map) }
}

/** The preference that keeps [AppSettings.liveEngine]. */
internal const val LIVE_ENGINE = "liveEngine"

/** The engine choice as kept ([LiveEngine]'s name); anything else is [LiveEngine.AUTO]. */
internal fun liveEngineOf(stored: String?): LiveEngine = LiveEngine.entries.firstOrNull { it.name == stored } ?: LiveEngine.AUTO

/** A stored LEVEL, when it is one the knob turns to (an older or edited file may hold anything). */
internal fun sampleGainOf(db: Float?): Float? = db?.takeIf { it in SAMPLE_GAINS }

/** A stored threshold: "off" (or anything unreadable or out of range) is none. */
internal fun sampleThresholdOf(stored: String?): Float? = stored?.toFloatOrNull()?.takeIf { it in SAMPLE_THRESHOLDS }

/**
 * Each setting as its key and stored text (library.json adds "app." to the
 * key); all but the debug screen's [AppSettings.liveEngine].
 */
internal fun AppSettings.values(): Map<String, String> = linkedMapOf(
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
    "keysNames" to keysNames.name,
    "keysShowNames" to keysShowNames.toString(),
    "keysViewWide" to keysViewWide.name,
    "keysViewTall" to keysViewTall.name,
    // Stored like keepLast: 0 for Auto.
    "pianoWhites" to (pianoWhites ?: 0).toString(),
    "haptics" to haptics.toString(),
    "liveTempo" to liveTempo.toString(),
    "sampleSource" to sampleSource.id,
    "sampleStereo" to sampleStereo.toString(),
    "sampleGainMic" to sampleGainMic.toString(),
    "sampleGainRsp" to sampleGainRsp.toString(),
    "sampleGainUsb" to sampleGainUsb.toString(),
    // No threshold is "off": 0 dB is a threshold.
    "sampleThreshold" to (sampleThreshold?.toString() ?: "off"),
    // Stored like keepLast: 0 for Free.
    "sampleBars" to (sampleBars ?: 0).toString(),
    "reviewSamples" to reviewSamples.toString(),
    "sampleNormalize" to sampleNormalize.toString(),
    "sampleTrimSilence" to sampleTrimSilence.toString(),
)

/** These settings with what library.json held ("app.*" keys) taken back; anything missing or unreadable stays as it is. */
internal fun AppSettings.withIndex(map: Map<String, String>): AppSettings = copy(
    theme = map["app.theme"]?.let { v -> runCatching { ThemeChoice.valueOf(v) }.getOrNull() } ?: theme,
    autoConnect = map["app.autoConnect"]?.toBooleanStrictOrNull() ?: autoConnect,
    keepScreenOn = map["app.keepScreenOn"]?.toBooleanStrictOrNull() ?: keepScreenOn,
    keepLast = map["app.keepLast"]?.toIntOrNull()?.let { n -> n.takeIf { it > 0 } } ?: if (map.containsKey("app.keepLast")) null else keepLast,
    liveOneGroup = map["app.liveOneGroup"]?.toBooleanStrictOrNull() ?: liveOneGroup,
    liveFollow = map["app.liveFollow"]?.toBooleanStrictOrNull() ?: liveFollow,
    guideSeen = map["app.guideSeen"]?.toBooleanStrictOrNull() ?: guideSeen,
    liveKeys = map["app.liveKeys"]?.toBooleanStrictOrNull() ?: liveKeys,
    keysRoot = map["app.keysRoot"]?.toIntOrNull()?.takeIf { it in 0..11 } ?: keysRoot,
    keysScale = map["app.keysScale"]?.let { v -> runCatching { Scale.valueOf(v) }.getOrNull() } ?: keysScale,
    keysOctave = map["app.keysOctave"]?.toIntOrNull()?.takeIf { it in Keys.MIN_OCTAVE..Keys.MAX_OCTAVE } ?: keysOctave,
    keysNames = map["app.keysNames"]?.let { v -> runCatching { NoteNames.valueOf(v) }.getOrNull() } ?: keysNames,
    keysShowNames = map["app.keysShowNames"]?.toBooleanStrictOrNull() ?: keysShowNames,
    keysViewWide = map["app.keysViewWide"]?.let { v -> runCatching { KeysView.valueOf(v) }.getOrNull() } ?: keysViewWide,
    keysViewTall = map["app.keysViewTall"]?.let { v -> runCatching { KeysView.valueOf(v) }.getOrNull() } ?: keysViewTall,
    // 0 is Auto; a size arc doesn't offer leaves the choice as it is.
    pianoWhites = when (val n = map["app.pianoWhites"]?.toIntOrNull()) {
        null -> pianoWhites
        0 -> null
        else -> Piano.choiceOf(n) ?: pianoWhites
    },
    haptics = map["app.haptics"]?.toBooleanStrictOrNull() ?: haptics,
    // A tempo arc doesn't offer leaves the choice as it is.
    liveTempo = map["app.liveTempo"]?.toIntOrNull()?.takeIf { it in Tempo.MIN..Tempo.MAX } ?: liveTempo,
    sampleSource = map["app.sampleSource"]?.let(SampleSource::of) ?: sampleSource,
    sampleStereo = map["app.sampleStereo"]?.toBooleanStrictOrNull() ?: sampleStereo,
    sampleGainMic = sampleGainOf(map["app.sampleGainMic"]?.toFloatOrNull()) ?: sampleGainMic,
    sampleGainRsp = sampleGainOf(map["app.sampleGainRsp"]?.toFloatOrNull()) ?: sampleGainRsp,
    sampleGainUsb = sampleGainOf(map["app.sampleGainUsb"]?.toFloatOrNull()) ?: sampleGainUsb,
    sampleThreshold = when (val v = map["app.sampleThreshold"]) {
        null -> sampleThreshold
        "off" -> null
        else -> sampleThresholdOf(v) ?: sampleThreshold
    },
    // 0 is Free; a length arc doesn't offer leaves the choice as it is.
    sampleBars = when (val n = map["app.sampleBars"]?.toIntOrNull()) {
        null -> sampleBars
        0 -> null
        else -> n.takeIf { it in SAMPLE_BARS } ?: sampleBars
    },
    reviewSamples = map["app.reviewSamples"]?.toBooleanStrictOrNull() ?: reviewSamples,
    sampleNormalize = map["app.sampleNormalize"]?.toBooleanStrictOrNull() ?: sampleNormalize,
    sampleTrimSilence = map["app.sampleTrimSilence"]?.toBooleanStrictOrNull() ?: sampleTrimSilence,
)
