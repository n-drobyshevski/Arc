package dev.arc.ep133.files

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle

/**
 * Telegram's apps (an addition): the official ones and the forks of its
 * Android code, which all send an .ogg they can open as Opus as a voice
 * message, whatever type the share says. SHARE on a take gives them its voice
 * message instead of the WAV ([replacing]); every other app gets the WAV.
 */
object Telegram {
    /** The manifest's <queries> lists the same, so they can be seen. */
    val PACKAGES = listOf(
        "org.telegram.messenger",
        "org.telegram.messenger.web",
        "org.telegram.messenger.beta",
        "org.telegram.plus",
        "tw.nekomimi.nekogram",
        "xyz.nextalone.nagram",
        "uz.unnarsx.cherrygram",
        "it.octogram.android",
    )

    /** The Telegram apps on this phone. */
    fun installed(context: Context): List<String> = PACKAGES.filter {
        try {
            context.packageManager.getPackageInfo(it, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * What [packages] get in place of the share's own extras: [voice] as the
     * stream, readable by them, and no text or subject, which Telegram would
     * send as the voice message's caption. For Intent.EXTRA_REPLACEMENT_EXTRAS.
     */
    fun replacing(context: Context, packages: List<String>, voice: Uri): Bundle {
        val extras = Bundle().apply {
            putParcelable(Intent.EXTRA_STREAM, voice)
            putString(Intent.EXTRA_TEXT, null)
            putString(Intent.EXTRA_SUBJECT, null)
        }
        // The chooser grants only the share's own stream; this one is granted here.
        for (p in packages) context.grantUriPermission(p, voice, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return Bundle().apply { for (p in packages) putBundle(p, extras) }
    }
}
