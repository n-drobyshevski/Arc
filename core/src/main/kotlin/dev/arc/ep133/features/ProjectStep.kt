package dev.arc.ep133.features

import dev.arc.ep133.protocol.Device

/** Where the project Live shows comes from: the device, arc's last read of it, or the factory pack. */
enum class ProjectSource { DEVICE, LAST_READ, FACTORY }

/**
 * Live's PROJECT key (an addition): each tap steps to the next project,
 * 1 → … → 9 → 1, as the key on the device does with a number.
 *
 * Connected, the device switches and Live follows it ([next]). Offline, the
 * projects arc has pads for are stepped through instead ([offlineViews]):
 * the last read's project and the factory pack's, one view per number.
 */
object ProjectStep {
    /** The project after [current] (1 when there is none, or it is out of range), wrapping 9 → 1. */
    fun next(current: Int?): Int =
        if (current == null || current !in 1 until Device.PROJECT_COUNT) 1 else current + 1

    /**
     * The projects Live can show offline, in order: [lastRead] (the last
     * read's project) and the factory pack's [factory] projects with pads,
     * each number once. A number in both is the last read: it is what the
     * device had there.
     */
    fun offlineViews(lastRead: Int?, factory: Collection<Int>): List<Int> =
        (factory + listOfNotNull(lastRead)).filter { it in 1..Device.PROJECT_COUNT }.distinct().sorted()

    /**
     * The view after [current] in [views], wrapping; the first when
     * [current] isn't one (a last read with no project). Null when there is
     * nothing to step to: fewer than two views (no factory pack, even with a
     * last read), so the key is greyed out.
     */
    fun nextOffline(current: Int?, views: List<Int>): Int? {
        if (views.size < 2) return null
        if (current == null) return views.first()
        return views.firstOrNull { it > current } ?: views.first()
    }

    /** Where offline view [n] comes from, or null when it isn't one. */
    fun sourceOf(n: Int, lastRead: Int?, factory: Collection<Int>): ProjectSource? = when (n) {
        !in 1..Device.PROJECT_COUNT -> null
        lastRead -> ProjectSource.LAST_READ
        in factory -> ProjectSource.FACTORY
        else -> null
    }
}
