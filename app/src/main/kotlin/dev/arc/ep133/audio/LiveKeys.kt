package dev.arc.ep133.audio

/**
 * Live's voice keys ("live:<group>:<offset>", "note:<midi>") as small ints for
 * the native engine (an addition), so its audio thread never touches a
 * string: a key gets the next number the first time it is seen and keeps it
 * for as long as the registry lives (it outlives the outputs, so a reopen
 * keeps the numbers). There are only so many pads and notes, so it stays small.
 *
 * Any thread; the lock is held only for a map lookup.
 */
internal class LiveKeys {
    private val ids = HashMap<String, Int>()
    private val names = ArrayList<String>()

    /** The number for [key], the same every time. */
    @Synchronized
    fun id(key: String): Int = ids.getOrPut(key) {
        names += key
        names.size - 1
    }

    /** The key numbered [id], or null for a number never given out. */
    @Synchronized
    fun name(id: Int): String? = names.getOrNull(id)
}
