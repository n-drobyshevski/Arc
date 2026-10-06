package dev.arc.ep133.audio

import java.lang.ref.ReferenceQueue
import java.lang.ref.WeakReference

/**
 * Which of Live's sounds the native engine holds, and in which slot (an
 * addition). A sound is copied in when it is prepared, or else the first time
 * it plays, and found again by its array (the same array, not equal contents: the app keeps decoded sounds
 * in memory and plays the same ones again). It is let go of once the app has
 * dropped the array (a weak reference sees it go), or, past [capBytes] or out
 * of slots, the least recently played first; the one just copied in always
 * stays. Letting go never cuts a voice short: the engine frees the memory once
 * no voice reads it, so a slot is free again at once.
 *
 * [load] and [unload] are the engine's; the producer's thread only (the
 * caller holds its lock).
 */
internal class NativeSamples(
    private val capBytes: Long,
    slots: Int,
    private val load: (slot: Int, pcm: ShortArray, channels: Int) -> Boolean,
    private val unload: (slot: Int) -> Unit,
) {
    private class Entry(
        pcm: ShortArray,
        queue: ReferenceQueue<ShortArray>,
        val slot: Int,
        val channels: Int,
        val bytes: Long,
        val hash: Int,
    ) : WeakReference<ShortArray>(pcm, queue) {
        var held = true
    }

    private val gone = ReferenceQueue<ShortArray>()
    // By the array's identity hash (a few arrays may share one).
    private val byHash = HashMap<Int, ArrayList<Entry>>()
    // By slot, the least recently played first.
    private val bySlot = LinkedHashMap<Int, Entry>(16, 0.75f, true)
    private val free = ArrayDeque<Int>(slots).apply { for (s in 0 until slots) addLast(s) }

    /** What the engine holds, in bytes. */
    var bytes = 0L
        private set

    /** Sounds held. */
    val size: Int get() = bySlot.size

    /** The slot holding [pcm], copied in first if it isn't; null when it can't be. */
    fun slot(pcm: ShortArray, channels: Int): Int? {
        while (true) dropGone(gone.poll() as Entry? ?: break)
        val hash = System.identityHashCode(pcm)
        byHash[hash]?.firstOrNull { it.get() === pcm && it.channels == channels }?.let { e ->
            bySlot[e.slot] // now the most recently played
            return e.slot
        }
        val size = pcm.size * 2L
        while (bySlot.isNotEmpty() && (free.isEmpty() || bytes + size > capBytes)) drop(bySlot.values.first())
        val slot = free.removeFirstOrNull() ?: return null
        if (!load(slot, pcm, channels)) {
            free.addFirst(slot)
            return null
        }
        val e = Entry(pcm, gone, slot, channels, size, hash)
        byHash.getOrPut(hash) { ArrayList(1) } += e
        bySlot[slot] = e
        bytes += size
        return slot
    }

    private fun dropGone(e: Entry) {
        if (e.held) drop(e)
    }

    private fun drop(e: Entry) {
        e.held = false
        unload(e.slot)
        bySlot.remove(e.slot)
        byHash[e.hash]?.let { list ->
            list.remove(e)
            if (list.isEmpty()) byHash.remove(e.hash)
        }
        free.addLast(e.slot)
        bytes -= e.bytes
    }
}
