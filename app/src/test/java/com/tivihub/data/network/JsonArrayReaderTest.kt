package com.tivihub.data.network

import java.io.StringReader
import java.io.Reader
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class JsonArrayReaderTest {
    @Test
    fun readsWrappedItemsOneAtATimeAndSkipsNestedUnknownValues() {
        val json = """{"status":"ok","data":[{"name":"Film, \"quoted\"","extra":{"nested":[1,2]}},null,{"name":"Another"}],"meta":{"count":2}}"""

        val names = JsonArrayReader.read(
            StringReader(json),
            description = "Test catalog"
        ) { item: JSONObject ->
            item.optString("name").takeIf(String::isNotBlank)
        }

        assertEquals(listOf("Film, \"quoted\"", "Another"), names)
    }

    @Test
    fun readsAlternateArrayKey() {
        val items = JsonArrayReader.read(
            StringReader("""{"categories":[{"category_id":"1"}]}"""),
            description = "Test categories",
            alternateKey = "categories"
        ) { it.getString("category_id") }

        assertEquals(listOf("1"), items)
    }

    @Test
    fun mapsItemsBeforeReadingTheEntireResponse() {
        val json = (0 until 5_000).joinToString(
            prefix = "[",
            postfix = "]"
        ) { """{"id":$it}""" }
        var charactersRead = 0
        val reader = object : Reader() {
            private val source = StringReader(json)

            override fun read(buffer: CharArray, offset: Int, length: Int): Int {
                val count = source.read(buffer, offset, length)
                if (count > 0) charactersRead += count
                return count
            }

            override fun close() = source.close()
        }

        val ids = JsonArrayReader.read(reader, "Test catalog") { item ->
            if (item.getInt("id") == 0) {
                assertTrue(charactersRead < json.length)
            }
            item.getInt("id")
        }

        assertEquals(5_000, ids.size)
    }

    @Test
    fun rejectsWrappedResponsesWithoutAnArray() {
        assertThrows(IllegalStateException::class.java) {
            JsonArrayReader.read(
                StringReader("""{"message":"unavailable"}"""),
                description = "Test catalog"
            ) { it }
        }
    }
}
