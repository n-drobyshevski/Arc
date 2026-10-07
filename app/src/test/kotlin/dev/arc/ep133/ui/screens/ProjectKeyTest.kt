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
}
