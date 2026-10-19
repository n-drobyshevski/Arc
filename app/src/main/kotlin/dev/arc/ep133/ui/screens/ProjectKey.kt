package dev.arc.ep133.ui.screens

import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.features.ProjectSource
import dev.arc.ep133.features.ProjectStep
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.text.MirrorText

/**
 * What Live's PROJECT key shows: the project ([shown], null before one is
 * read), where it comes from ([source]: the device, the last read, or the
 * factory pack), whether a tap does anything, and whether the device is
 * switching (its light is on meanwhile).
 */
data class ProjectKeyUi(
    val shown: Int? = null,
    val source: ProjectSource = ProjectSource.DEVICE,
    val enabled: Boolean = false,
    val switching: Boolean = false,
)

/**
 * The PROJECT key for [mirror], with the device [busy] (UiState.busy).
 *
 * - Connected: the project switched to while it switches, else the one
 *   read; a tap works once Live has read the device and while nothing else
 *   holds it, or while PROJECT's own switch does (taps then move it on).
 * - Offline: the view shown, from the last read or the factory pack (every
 *   factory view's line is MirrorText.FACTORY); a tap works with two views
 *   or more, so not without the pack (ProjectStep.nextOffline).
 * - Nothing to show (no Live, or not connected and nothing read or saved):
 *   greyed out.
 */
internal fun projectKeyOf(mirror: MirrorUi?, busy: Boolean): ProjectKeyUi = when {
    mirror == null -> ProjectKeyUi()
    mirror.offline != null -> ProjectKeyUi(
        shown = mirror.state.activeProject,
        source = if (mirror.offline == MirrorText.FACTORY) ProjectSource.FACTORY else ProjectSource.LAST_READ,
        enabled = ProjectStep.nextOffline(mirror.state.activeProject, mirror.offlineProjects) != null,
    )
    mirror.error != null -> ProjectKeyUi()
    else -> ProjectKeyUi(
        shown = mirror.projectTarget ?: mirror.state.activeProject,
        source = ProjectSource.DEVICE,
        enabled = !mirror.loading && (!busy || mirror.projectTarget != null),
        switching = mirror.projectTarget != null,
    )
}

/** A key of the project sheet: project [n], whether a pick goes there, and whether it is [shown] now. */
data class ProjectChoice(val n: Int, val enabled: Boolean, val shown: Boolean)

/**
 * The project sheet's keys, 1 to 9, for [mirror] (PROJECT held): any
 * project while a tap on PROJECT works when connected, only the views arc
 * has offline (the last read's project and the factory pack's); the one
 * shown is marked, and picking it does nothing.
 */
internal fun projectChoicesOf(mirror: MirrorUi?, busy: Boolean): List<ProjectChoice> {
    val key = projectKeyOf(mirror, busy)
    val views = mirror?.offlineProjects.takeIf { mirror?.offline != null }
    return (1..Device.PROJECT_COUNT).map { n ->
        ProjectChoice(n, enabled = key.enabled && n != key.shown && (views == null || n in views), shown = n == key.shown)
    }
}
