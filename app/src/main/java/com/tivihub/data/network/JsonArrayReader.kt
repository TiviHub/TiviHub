package com.tivihub.data.network

import org.json.JSONObject
import java.io.BufferedReader
import java.io.PushbackReader
import java.io.Reader

internal object JsonArrayReader {
    fun <T> read(
        reader: Reader,
        description: String,
        alternateKey: String? = null,
        mapItem: (JSONObject) -> T?
    ): List<T> = JsonValueStream(reader).readArray(description, alternateKey, mapItem)
}

private class JsonValueStream(reader: Reader) {
    private val input = PushbackReader(BufferedReader(reader), 1)

    fun <T> readArray(
        description: String,
        alternateKey: String?,
        mapItem: (JSONObject) -> T?
    ): List<T> {
        skipWhitespace()
        return when (val first = input.read()) {
            '['.code -> {
                input.unread(first)
                readItems(mapItem)
            }
            '{'.code -> readWrappedItems(description, alternateKey, mapItem)
            else -> throw IllegalStateException("$description returned an unexpected list response.")
        }
    }

    private fun <T> readWrappedItems(
        description: String,
        alternateKey: String?,
        mapItem: (JSONObject) -> T?
    ): List<T> {
        val acceptedKeys = setOfNotNull("data", alternateKey)
        var items: List<T>? = null
        while (true) {
            skipWhitespace()
            when (val next = input.read()) {
                '}'.code -> return items
                    ?: throw IllegalStateException("$description returned an unexpected list response.")
                '"'.code -> input.unread(next)
                else -> throw IllegalStateException("$description returned an unexpected list response.")
            }

            val key = readRawValue()
            if (!key.startsWith('"')) {
                throw IllegalStateException("$description returned an unexpected list response.")
            }
            val decodedKey = JSONObject("{\"key\":$key}").getString("key")
            expect(':', description)
            skipWhitespace()
            if (decodedKey in acceptedKeys && peek() == '['.code) {
                val parsedItems = readItems(mapItem)
                if (items == null) items = parsedItems
            } else {
                readRawValue()
            }

            skipWhitespace()
            when (input.read()) {
                ','.code -> Unit
                '}'.code -> return items
                    ?: throw IllegalStateException("$description returned an unexpected list response.")
                else -> throw IllegalStateException("$description returned an unexpected list response.")
            }
        }
    }

    private fun <T> readItems(mapItem: (JSONObject) -> T?): List<T> {
        expect('[', "JSON array")
        val results = mutableListOf<T>()
        while (true) {
            skipWhitespace()
            when (val next = input.read()) {
                ']'.code -> return results
                -1 -> throw IllegalStateException("JSON array was not terminated.")
                else -> input.unread(next)
            }

            val rawItem = readRawValue()
            if (rawItem.startsWith('{')) {
                mapItem(JSONObject(rawItem))?.let(results::add)
            }

            skipWhitespace()
            when (input.read()) {
                ','.code -> Unit
                ']'.code -> return results
                else -> throw IllegalStateException("JSON array contained an unexpected value.")
            }
        }
    }

    private fun readRawValue(): String {
        skipWhitespace()
        val first = input.read()
        if (first == -1) throw IllegalStateException("Unexpected end of JSON input.")
        val value = StringBuilder().append(first.toChar())

        if (first == '"'.code) {
            var escaped = false
            while (true) {
                val next = input.read()
                if (next == -1) throw IllegalStateException("JSON string was not terminated.")
                value.append(next.toChar())
                if (escaped) {
                    escaped = false
                } else if (next == '\\'.code) {
                    escaped = true
                } else if (next == '"'.code) {
                    return value.toString()
                }
            }
        }

        if (first == '{'.code || first == '['.code) {
            var depth = 1
            var inString = false
            var escaped = false
            while (depth > 0) {
                val next = input.read()
                if (next == -1) throw IllegalStateException("JSON value was not terminated.")
                value.append(next.toChar())
                if (inString) {
                    if (escaped) {
                        escaped = false
                    } else if (next == '\\'.code) {
                        escaped = true
                    } else if (next == '"'.code) {
                        inString = false
                    }
                } else {
                    when (next) {
                        '"'.code -> inString = true
                        '{'.code, '['.code -> depth++
                        '}'.code, ']'.code -> depth--
                    }
                }
            }
            return value.toString()
        }

        while (true) {
            val next = input.read()
            if (next == -1) break
            if (next.toChar().isWhitespace() || next == ','.code || next == ']'.code || next == '}'.code) {
                input.unread(next)
                break
            }
            value.append(next.toChar())
        }
        return value.toString()
    }

    private fun peek(): Int {
        skipWhitespace()
        val next = input.read()
        if (next != -1) input.unread(next)
        return next
    }

    private fun expect(character: Char, description: String) {
        skipWhitespace()
        if (input.read() != character.code) {
            throw IllegalStateException("$description returned an unexpected JSON response.")
        }
    }

    private fun skipWhitespace() {
        while (true) {
            val next = input.read()
            if (next == -1) return
            if (!next.toChar().isWhitespace()) {
                input.unread(next)
                return
            }
        }
    }
}
