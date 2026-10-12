package com.tivihub.data.network

import com.tivihub.data.model.EpgProgram
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.StringReader
import java.time.DateTimeException
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.xml.parsers.SAXParserFactory
import org.xml.sax.Attributes
import org.xml.sax.EntityResolver
import org.xml.sax.InputSource
import org.xml.sax.helpers.DefaultHandler

class XmltvParser {
    fun parse(xml: String, source: String): List<EpgProgram> =
        parse(ByteArrayInputStream(xml.toByteArray(Charsets.UTF_8)), source)

    fun parse(
        input: InputStream,
        source: String,
        startMillis: Long = Long.MIN_VALUE,
        endMillis: Long = Long.MAX_VALUE
    ): List<EpgProgram> {
        require(startMillis < endMillis) { "EPG time window must have a valid start and end." }
        val factory = SAXParserFactory.newInstance().apply {
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        }
        val programs = mutableListOf<EpgProgram>()
        val handler = object : DefaultHandler() {
            private var currentChannel: String? = null
            private var currentStart: Long? = null
            private var currentEnd: Long? = null
            private var keepProgram = false
            private var title: StringBuilder? = null
            private var synopsis: StringBuilder? = null
            private var capture: StringBuilder? = null

            override fun startElement(uri: String?, localName: String?, qName: String, attributes: Attributes) {
                when (qName) {
                    "programme" -> {
                        currentChannel = attributes.getValue("channel")?.takeIf(String::isNotBlank)
                        currentStart = parseXmltvDate(attributes.getValue("start").orEmpty())
                        currentEnd = parseXmltvDate(attributes.getValue("stop").orEmpty())
                        val start = currentStart
                        val end = currentEnd
                        keepProgram = currentChannel != null &&
                            start != null &&
                            end != null &&
                            start < end &&
                            start < endMillis &&
                            end > startMillis
                        title = null
                        synopsis = null
                    }
                    "title" -> if (keepProgram && title == null) {
                        capture = StringBuilder()
                    }
                    "desc" -> if (keepProgram && synopsis == null) {
                        capture = StringBuilder()
                    }
                }
            }

            override fun characters(characters: CharArray, start: Int, length: Int) {
                capture?.append(characters, start, length)
            }

            override fun endElement(uri: String?, localName: String?, qName: String) {
                when (qName) {
                    "title" -> {
                        if (title == null) title = capture
                        capture = null
                    }
                    "desc" -> {
                        if (synopsis == null) synopsis = capture
                        capture = null
                    }
                    "programme" -> {
                        if (keepProgram) {
                            val channel = currentChannel
                            val start = currentStart
                            val end = currentEnd
                            val programTitle = title?.toString()?.trim()?.takeIf(String::isNotBlank)
                            if (channel != null && start != null && end != null && programTitle != null) {
                                programs += EpgProgram(
                                    channelId = channel,
                                    title = programTitle,
                                    synopsis = synopsis?.toString()?.trim()?.takeIf(String::isNotBlank),
                                    startMillis = start,
                                    endMillis = end,
                                    source = source
                                )
                            }
                        }
                        currentChannel = null
                        currentStart = null
                        currentEnd = null
                        keepProgram = false
                        capture = null
                    }
                }
            }
        }
        factory.newSAXParser().xmlReader.apply {
            contentHandler = handler
            entityResolver = EntityResolver { _, _ -> InputSource(StringReader("")) }
        }.parse(InputSource(input))
        return programs
    }

    private fun parseXmltvDate(value: String): Long? {
        val match = Regex("""^(\d{14})(?:\s*([+-]\d{4}))?$""").matchEntire(value.trim())
            ?: return null
        return try {
            val date = LocalDateTime.parse(match.groupValues[1], DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
            val offset = match.groupValues[2].takeIf(String::isNotEmpty)
                ?.let { ZoneOffset.of("${it.substring(0, 3)}:${it.substring(3)}") }
                ?: ZoneOffset.UTC
            date.toInstant(offset).toEpochMilli()
        } catch (_: DateTimeException) {
            null
        }
    }
}
