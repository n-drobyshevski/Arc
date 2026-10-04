package dev.arc.ep133.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Room's MigrationTestHelper needs a device. Instead, check the migration
 * against the schemas Room exports: version 2 must be version 1 plus exactly
 * the tables the migration creates, with Room's own SQL.
 */
class MigrationTest {
    private fun entities(version: Int): Map<String, JsonObject> {
        val f = File("schemas/dev.arc.ep133.data.ArcDatabase/$version.json")
        val db = Json.parseToJsonElement(f.readText()).jsonObject.getValue("database").jsonObject
        return db.getValue("entities").jsonArray.associate { e ->
            e.jsonObject.getValue("tableName").jsonPrimitive.content to e.jsonObject
        }
    }

    @Test
    fun `version 2 adds only the search tables, with Room's SQL`() {
        val v1 = entities(1)
        val v2 = entities(2)
        // The backups table, its columns and its index are untouched.
        assertEquals(v1.getValue("backups"), v2.getValue("backups"))
        val added = v2.keys - v1.keys
        assertEquals(setOf("sound_names", "indexed_backups"), added)
        val expected = added.map { t ->
            val e = v2.getValue(t)
            val sql = listOf(e.getValue("createSql").jsonPrimitive.content) +
                (e["indices"]?.jsonArray?.map { it.jsonObject.getValue("createSql").jsonPrimitive.content } ?: emptyList())
            sql.map { it.replace("\${TABLE_NAME}", t) }
        }.flatten().toSet()
        assertEquals(expected, MIGRATION_1_2_SQL.toSet())
        assertEquals(1, MIGRATION_1_2.startVersion)
        assertEquals(2, MIGRATION_1_2.endVersion)
    }
}
