package dev.arc.ep133.data

import androidx.room.TypeConverter
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/** Lists and the per-project slot map are stored as JSON text (kotlinx.serialization). */
class Converters {
    private val intList = ListSerializer(Int.serializer())
    private val slotMap = MapSerializer(Int.serializer(), ListSerializer(Int.serializer()))

    @TypeConverter
    fun fromIntList(v: List<Int>): String = Json.encodeToString(intList, v)

    @TypeConverter
    fun toIntList(s: String): List<Int> = Json.decodeFromString(intList, s)

    @TypeConverter
    fun fromSlotMap(v: Map<Int, List<Int>>): String = Json.encodeToString(slotMap, v)

    @TypeConverter
    fun toSlotMap(s: String): Map<Int, List<Int>> = Json.decodeFromString(slotMap, s)
}
