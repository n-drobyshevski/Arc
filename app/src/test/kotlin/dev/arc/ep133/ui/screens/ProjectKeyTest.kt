package dev.arc.ep133.ui.screens

import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.ProjectSource
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** What PROJECT shows and whether it can be tapped, connected and offline. */
class ProjectKeyTest {
    private val read = MirrorUi(MirrorState(activeProject = 3), loading = false)

    @Test
    fun `no Live or nothing to show greys it out`() {
        assertEquals(ProjectKeyUi(), projectKeyOf(null, busy = false))
        assertEquals(ProjectKeyUi(), projectKeyOf(MirrorUi(loading = false, error = MirrorText.NOT_CONNECTED), busy = false))
    }

    @Test
    fun `connected it shows the device's project once read, and waits for the device`() {
        assertEquals(ProjectKeyUi(3, ProjectSource.DEVICE, enabled = true), projectKeyOf(read, busy = false))
        // Reading, or another action holding the device.
        assertEquals(ProjectKeyUi(null, ProjectSource.DEVICE, enabled = false), projectKeyOf(MirrorUi(), busy = false))
        assertEquals(ProjectKeyUi(3, ProjectSource.DEVICE, enabled = false), projectKeyOf(read, busy = true))
    }

    @Test
    fun `switching it shows the target, lights, and takes more taps through its own busy`() {
        val switching = read.copy(projectTarget = 5)
        assertEquals(ProjectKeyUi(5, ProjectSource.DEVICE, enabled = true, switching = true), projectKeyOf(switching, busy = true))
    }

    @Test
    fun `offline it steps through two views or more, the pack's marked factory`() {
        val lastRead = MirrorUi(MirrorState(activeProject = 3), loading = false, offline = MirrorText.lastSeen("5 Oct, 14:02"))
        // No pack: the last read alone, greyed out.
        assertEquals(ProjectKeyUi(3, ProjectSource.LAST_READ, enabled = false), projectKeyOf(lastRead.copy(offlineProjects = listOf(3)), busy = false))
        assertEquals(ProjectKeyUi(3, ProjectSource.LAST_READ, enabled = true), projectKeyOf(lastRead.copy(offlineProjects = listOf(1, 2, 3)), busy = false))
        val factory = MirrorUi(MirrorState(activeProject = 2), loading = false, offline = MirrorText.FACTORY, offlineProjects = listOf(1, 2, 3))
        assertEquals(ProjectKeyUi(2, ProjectSource.FACTORY, enabled = true), projectKeyOf(factory, busy = false))
        // Busy doesn't matter offline: nothing is sent.
        assertEquals(ProjectKeyUi(2, ProjectSource.FACTORY, enabled = true), projectKeyOf(factory, busy = true))
    }

    @Test
    fun `the project sheet offers every project connected, the views arc has offline, never the one shown`() {
        val open = { m: MirrorUi?, busy: Boolean -> projectChoicesOf(m, busy).filter { it.enabled }.map { it.n } }
        assertEquals((1..9).toList(), projectChoicesOf(read, busy = false).map { it.n })
        assertEquals(listOf(1, 2, 4, 5, 6, 7, 8, 9), open(read, false))
        assertEquals(listOf(3), projectChoicesOf(read, busy = false).filter { it.shown }.map { it.n })
        // Switching: the target is the one shown.
        assertEquals(listOf(5), projectChoicesOf(read.copy(projectTarget = 5), busy = true).filter { it.shown }.map { it.n })
        // Another action holding the device, or nothing read: nothing to pick.
        assertEquals(emptyList<Int>(), open(read, true))
        assertEquals(emptyList<Int>(), open(null, false))
        // Offline: the views only, and none without the pack.
        val factory = MirrorUi(MirrorState(activeProject = 2), loading = false, offline = MirrorText.FACTORY, offlineProjects = listOf(1, 2, 3, 5))
        assertEquals(listOf(1, 3, 5), open(factory, false))
        assertEquals(emptyList<Int>(), open(factory.copy(offlineProjects = listOf(2)), false))
    }
}
