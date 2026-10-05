package dev.arc.ep133.data

import android.content.Context
import androidx.core.content.edit
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
)

/**
 * The settings, kept in the app's preferences and copied into library.json
 * (as "app.*") so they come back after a reinstall with the library.
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
    )

    fun update(change: (AppSettings) -> AppSettings) {
        val next = change(_settings.value)
        prefs.edit {
            putString("theme", next.theme.name)
            putBoolean("autoConnect", next.autoConnect)
            putBoolean("keepScreenOn", next.keepScreenOn)
            putInt("keepLast", next.keepLast ?: 0)
        }
        _settings.value = next
    }

    /** As stored in library.json. */
    fun toIndex(): Map<String, String> = _settings.value.let {
        mapOf(
            "app.theme" to it.theme.name,
            "app.autoConnect" to it.autoConnect.toString(),
            "app.keepScreenOn" to it.keepScreenOn.toString(),
            "app.keepLast" to (it.keepLast ?: 0).toString(),
        )
    }

    /** Takes back what library.json held; anything missing or unreadable stays as it is. */
    fun fromIndex(map: Map<String, String>) = update { cur ->
        cur.copy(
            theme = map["app.theme"]?.let { v -> runCatching { ThemeChoice.valueOf(v) }.getOrNull() } ?: cur.theme,
            autoConnect = map["app.autoConnect"]?.toBooleanStrictOrNull() ?: cur.autoConnect,
            keepScreenOn = map["app.keepScreenOn"]?.toBooleanStrictOrNull() ?: cur.keepScreenOn,
            keepLast = map["app.keepLast"]?.toIntOrNull()?.let { n -> n.takeIf { it > 0 } } ?: if (map.containsKey("app.keepLast")) null else cur.keepLast,
        )
    }
}
