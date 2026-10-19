package dev.arc.ep133.audio

/**
 * When Live holds audio focus (an addition): one request, shared by the
 * voices and the click, so asking for it twice can't take it from Live's
 * own pads. It is asked for when a voice starts or the click goes on, and
 * let go of once the voices have been quiet for [quietNs] with the click
 * off, or at once when Live's output closes with the click off. Pure: it
 * says which request ([T]) to ask for or let go of, and [LiveAudio] does it.
 * Safe from any thread: [ask] and [letGo] are called under its lock as it
 * decides, so the queue they feed gets them in that order (a let-go decided
 * first can't reach Android after the ask that followed it and drop it).
 */
internal class FocusHold<T : Any>(
    private val ask: (T) -> Unit = {},
    private val letGo: (T) -> Unit = {},
    private val quietNs: Long = QUIET_NS,
) {
    companion object {
        /** Quiet this long, other apps may have the output back. */
        const val QUIET_NS = 2_000_000_000L

        // Not quiet (or not counted yet).
        private const val NONE = Long.MIN_VALUE
    }

    private var held: T? = null
    private var click = false
    private var quietSince = NONE

    /** Whether focus is held: asked for and not let go of. */
    val holding: Boolean
        @Synchronized get() = held != null

    /** A voice starts: [request] asked for (and returned), or null while focus is held. Its quiet counts afresh. */
    @Synchronized
    fun sound(request: T): T? {
        quietSince = NONE
        return take(request)
    }

    /** The click goes on: [request] asked for (and returned), or null while focus is held. Focus stays while it is on. */
    @Synchronized
    fun clickOn(request: T): T? {
        click = true
        return take(request)
    }

    /** The click went off: the quiet counts from the next [quiet], so the focus outlasts it by [quietNs]. */
    @Synchronized
    fun clickOff() {
        click = false
        quietSince = NONE
    }

    /**
     * After each block of the open output, [silent] when no voice sounds, at
     * [now]: the request let go of once quiet for [quietNs] with the click
     * off, else null.
     */
    @Synchronized
    fun quiet(silent: Boolean, now: Long): T? {
        if (!silent) {
            quietSince = NONE
            return null
        }
        if (quietSince == NONE) quietSince = now
        return if (!click && held != null && now - quietSince > quietNs) drop() else null
    }

    /** Nothing counts the quiet (Live's output closed): the request let go of now, unless the click is on. */
    @Synchronized
    fun idle(): T? = if (click) null else drop()

    /** Focus was taken (a call): the click is off, and the request let go of, so the next sound asks again. */
    @Synchronized
    fun lost(): T? {
        click = false
        return drop()
    }

    private fun take(request: T): T? {
        if (held != null) return null
        held = request
        ask(request)
        return request
    }

    private fun drop(): T? {
        val h = held
        held = null
        quietSince = NONE
        h?.let(letGo)
        return h
    }
}
