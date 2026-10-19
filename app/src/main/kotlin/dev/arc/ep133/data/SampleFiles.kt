package dev.arc.ep133.data

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * SAMPLE's recordings waiting to go on the EP-133 (an addition): WAV files
 * in arc's own storage (`smp-20261007-142301.wav`), each one the sound of a
 * [dev.arc.ep133.features.SoundSource.RECORDED] pad change. A file is
 * deleted once its sample is on the device, and moved into [Takes] when its
 * pad change is discarded, reset or replaced, so a recording is never simply
 * lost. A take waiting on the review sheet is kept here too, until KEEP.
 * A synth sound made offline from a card is kept here as well
 * (`syn-…wav`, [writeSynth]); it is thrown away, never moved to Takes.
 */
class SampleFiles(private val dir: File) {
    private val stamp get() = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)

    /** A file for a recording kept at [now], not yet written. */
    fun newFile(now: Long): File {
        dir.mkdirs()
        val base = "smp-" + stamp.format(Date(now))
        var f = File(dir, "$base.wav")
        var n = 2
        while (f.exists()) f = File(dir, "$base-${n++}.wav")
        return f
    }

    /**
     * [bytes] written to a new file for a recording kept at [now]: the
     * name is taken as the file is made, so two written in the same second
     * never land on one. A write that fails (the phone full) leaves nothing
     * behind, and throws.
     */
    fun write(now: Long, bytes: ByteArray): File {
        dir.mkdirs()
        var f = newFile(now)
        while (!f.createNewFile()) f = newFile(now)
        try {
            f.writeBytes(bytes)
        } catch (e: java.io.IOException) {
            f.delete()
            throw e
        }
        return f
    }

    /**
     * The recordings left over from before [before] (ms, as files are
     * stamped) that no pad change names ([referenced]): a take arc was
     * closed on while it waited for KEEP, or a KEEP cut short. Each belongs
     * in Takes.
     */
    fun strays(referenced: Set<String>, before: Long): List<String> =
        (dir.listFiles { f -> f.isFile && f.name.startsWith("smp-") && f.name.endsWith(".wav") } ?: emptyArray())
            .filter { it.name !in referenced && it.lastModified() < before }
            .map { it.name }
            .sorted()

    /**
     * A synth line's sound, made offline ([dev.arc.ep133.features.SynthVoice.fileName]), written as [name]: the
     * name says what is in it, so a file already there at its size is used as it is. Written to a .tmp file
     * first, then renamed, so a write cut short never leaves half a sound under the name. A name that isn't a
     * synth's WAV is refused (IllegalArgumentException); a write that fails leaves nothing behind, and throws.
     */
    fun writeSynth(name: String, bytes: ByteArray): File {
        require(isSynth(name) && name.endsWith(".wav")) { "Not a synth file: $name" }
        dir.mkdirs()
        val f = file(name)
        if (f.isFile && f.length() == bytes.size.toLong()) return f
        val tmp = File(dir, f.name + ".tmp")
        try {
            tmp.writeBytes(bytes)
            if (!tmp.renameTo(f)) {
                f.delete()
                if (!tmp.renameTo(f)) throw java.io.IOException("Can't save ${f.name}")
            }
        } catch (e: java.io.IOException) {
            tmp.delete()
            throw e
        }
        return f
    }

    /**
     * The synth sounds made offline that no pad change names ([referenced]), from before [before] (ms): thrown
     * away, as the card can always make them again. [strays] never lists them.
     */
    fun synthStrays(referenced: Set<String>, before: Long): List<String> =
        (dir.listFiles { f -> f.isFile && isSynth(f.name) && f.name.endsWith(".wav") } ?: emptyArray())
            .filter { it.name !in referenced && it.lastModified() < before }
            .map { it.name }
            .sorted()

    /**
     * The .tmp files [writeSynth] left from before [before] (ms): Arc was closed while it wrote them, so they
     * hold half a sound and no pad names them. Only for the sweep at start, as a later [before] could catch a
     * write still going.
     */
    fun synthLeftovers(before: Long): List<String> =
        (dir.listFiles { f -> f.isFile && isSynth(f.name) && f.name.endsWith(".tmp") } ?: emptyArray())
            .filter { it.lastModified() < before }
            .map { it.name }
            .sorted()

    /** The file named [name]; only its last part counts, so a name can't reach out of the folder. */
    fun file(name: String): File = File(dir, File(name).name)

    fun delete(name: String): Boolean = file(name).delete()

    /**
     * Moves [name] into [takes] as a take of its own, named for when it was
     * recorded; false when it is missing or can't be moved.
     */
    fun moveToTakes(name: String, takes: Takes): Boolean {
        val from = file(name)
        if (!from.isFile) return false
        val to = takes.newFile(from.lastModified())
        if (from.renameTo(to)) return true
        // Another file system (never in arc's own storage, but cheap to allow): copied, then dropped.
        return runCatching {
            from.copyTo(to)
            from.delete()
        }.isSuccess
    }

    companion object {
        /** The start of a synth sound's file name ("syn-1a2b3c4d-1-0-9.wav"); a recording's is "smp-". */
        const val SYNTH_PREFIX = "syn-"

        /** Whether [name] is a synth sound's file (only its last part counts). */
        fun isSynth(name: String): Boolean = File(name).name.startsWith(SYNTH_PREFIX)
    }
}
