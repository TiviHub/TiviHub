package com.tivihub.data.network

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class XmltvParserTest {
    @Test
    fun parsesProgramWithOffsetAndDescription() {
        val xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <tv>
              <programme start="20261012130000 +0000" stop="20261012140000 +0000" channel="channel.one">
                <title>Afternoon News</title>
                <desc>Daily headlines</desc>
              </programme>
            </tv>
        """.trimIndent()

        val program = XmltvParser().parse(xml, "Test guide").single()

        assertEquals("channel.one", program.channelId)
        assertEquals("Afternoon News", program.title)
        assertEquals("Daily headlines", program.synopsis)
        assertEquals("Test guide", program.source)
        assertEquals(3_600_000, program.endMillis - program.startMillis)
    }

    @Test
    fun streamingParserKeepsOnlyProgramsThatOverlapGuideWindow() {
        val xml = """
            <tv>
              <programme start="20261012130000 +0000" stop="20261012140000 +0000" channel="old">
                <title>Old programme</title>
              </programme>
              <programme start="20261012180000 +0000" stop="20261012190000 +0000" channel="current">
                <title>Current programme</title>
              </programme>
            </tv>
        """.trimIndent()
        val windowStart = Instant.parse("2026-10-12T17:30:00Z").toEpochMilli()
        val windowEnd = Instant.parse("2026-10-12T19:30:00Z").toEpochMilli()

        val programs = XmltvParser().parse(
            xml.byteInputStream(),
            "Test guide",
            windowStart,
            windowEnd
        )

        assertEquals(1, programs.size)
        assertEquals("current", programs.single().channelId)
        assertEquals("Current programme", programs.single().title)
    }

    @Test
    fun skipsProgrammesWithInvalidOrReversedTimes() {
        val xml = """
            <tv>
              <programme start="20261012180000 +0000" stop="20261012170000 +0000" channel="reversed">
                <title>Reversed programme</title>
              </programme>
              <programme start="not-a-date" stop="20261012190000 +0000" channel="invalid">
                <title>Invalid programme</title>
              </programme>
              <programme start="20261012180000 +0000" stop="20261012190000 +0000" channel="valid">
                <title>Valid programme</title>
              </programme>
            </tv>
        """.trimIndent()

        val programs = XmltvParser().parse(xml, "Test guide")

        assertEquals(1, programs.size)
        assertEquals("valid", programs.single().channelId)
    }
}
