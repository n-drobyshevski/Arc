package dev.arc.ep133.protocol

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.testing.DemoData
import dev.arc.ep133.testing.MockEP133
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Live's PROJECT key: the active project read from, and written to, /projects' metadata. */
class ProjectSwitchTest {
    private suspend fun TestScope.connect(dev: MockEP133): Session {
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        return s
    }

    @Test
    fun `the active value names a project node`() {
        assertEquals(1, Device.projectOfActive(JsJson.number(3000)))
        assertEquals(4, Device.projectOfActive(JsonPrimitive("6000")))
        assertEquals(9, Device.projectOfActive(JsJson.number(11000.0)))
        assertNull(Device.projectOfActive(JsJson.number(3500)))
        assertNull(Device.projectOfActive(JsJson.number(2000)))
        assertNull(Device.projectOfActive(JsonPrimitive("p3")))
        assertNull(Device.projectOfActive(JsonNull))
        assertNull(Device.projectOfActive(JsonObject(emptyMap())))
        assertNull(Device.projectOfActive(null))
    }

    @Test
    fun `switching writes the project's node as active, and it reads back`() = runTest {
        val dev = DemoData.device()
        val s = connect(dev)
        assertEquals(1, Device.activeProject(s))
        Device.setActiveProject(s, 3)
        assertEquals(Device.PROJECTS_NODE to """{"active":5000}""", dev.metaWrites.last())
        assertEquals(3, Device.activeProject(s))
        Device.setActiveProject(s, Device.PROJECT_COUNT)
        assertEquals(Device.PROJECTS_NODE to """{"active":11000}""", dev.metaWrites.last())
        assertEquals(9, Device.activeProject(s))
        // Only 1..9: nothing is sent for another number.
        val writes = dev.metaWrites.size
        assertThrows<IllegalArgumentException> { Device.setActiveProject(s, 0) }
        assertThrows<IllegalArgumentException> { Device.setActiveProject(s, 10) }
        assertEquals(writes, dev.metaWrites.size)
        s.close()
    }

    @Test
    fun `an active value that names no project reads as none`() = runTest {
        val dev = MockEP133(active = 2000)
        val s = connect(dev)
        assertNull(Device.activeProject(s))
        s.close()
    }
}
