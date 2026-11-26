package com.tuscoffee.service;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;

public class KnowledgeTextExtractor {
    static final String DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final int MAX_DOCX_XML_BYTES = 4 * 1024 * 1024;
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final int MAX_CHARS = 300_000;
    private static final int MAX_PAGES = 100;
    private static final int MAX_CHUNKS = 600;
    private static final int CHUNK_LENGTH = 1600;
    private static final int OVERLAP = 250;
    private static final Pattern MARKDOWN_HEADING = Pattern.compile("(?m)^ {0,3}#{1,6}[ \t]+([^\r\n]+)");

    public record Chunk(String text, Integer page, String section, int estimatedTokens) {}

    public List<Chunk> extract(Path path, String type) throws IOException {
        if (Files.size(path) > MAX_BYTES) {
            throw new InvalidDocument("FILE_TOO_LARGE");
        }
        List<Chunk> result = new ArrayList<>();
        switch (type) {
            case "application/pdf" -> readPdf(path, result);
            case DOCX_TYPE -> split(readDocx(path), null, null, result);
            case "text/plain", "text/markdown" -> {
                String text = Files.readString(path, StandardCharsets.UTF_8);
                if (text.length() > MAX_CHARS || text.indexOf('\0') >= 0) {
                    throw new InvalidDocument("TEXT_LIMIT_OR_INVALID");
                }
                if ("text/markdown".equals(type)) {
                    splitMarkdown(text, result);
                } else {
                    split(text, null, null, result);
                }
            }
            default -> throw new InvalidDocument("UNSUPPORTED_DOCUMENT");
        }
        if (result.isEmpty()) {
            throw new InvalidDocument("NO_EXTRACTABLE_TEXT");
        }
        return List.copyOf(result);
    }

    static String readDocx(Path path) throws IOException {
        try (var archive = new ZipFile(path.toFile())) {
            var document = archive.getEntry("word/document.xml");
            if (archive.getEntry("[Content_Types].xml") == null || document == null || document.isDirectory()) {
                throw new InvalidDocument("INVALID_DOCX");
            }
            try (var input = archive.getInputStream(document)) {
                byte[] xml = input.readNBytes(MAX_DOCX_XML_BYTES + 1);
                if (xml.length > MAX_DOCX_XML_BYTES) throw new InvalidDocument("DOCX_XML_LIMIT");
                return readWordText(xml);
            }
        } catch (ZipException | XMLStreamException ex) {
            throw new InvalidDocument("INVALID_DOCX");
        }
    }

    private static String readWordText(byte[] xml) throws XMLStreamException {
        var factory = XMLInputFactory.newDefaultFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        var reader = factory.createXMLStreamReader(new ByteArrayInputStream(xml));
        var text = new StringBuilder();
        try {
            while (reader.hasNext()) {
                int event = reader.next();
                if (event == XMLStreamConstants.DTD) throw new InvalidDocument("INVALID_DOCX");
                if (event != XMLStreamConstants.START_ELEMENT) continue;
                if (!"document".equals(reader.getLocalName()) || !isWordNamespace(reader.getNamespaceURI())) {
                    throw new InvalidDocument("INVALID_DOCX");
                }
                break;
            }
            while (reader.hasNext()) {
                int event = reader.next();
                if ((event == XMLStreamConstants.START_ELEMENT || event == XMLStreamConstants.END_ELEMENT)
                        && isWordNamespace(reader.getNamespaceURI())) {
                    String name = reader.getLocalName();
                    if (event == XMLStreamConstants.START_ELEMENT) {
                        switch (name) {
                            case "t" -> text.append(reader.getElementText());
                            case "tab" -> text.append('\t');
                            case "br", "cr" -> text.append('\n');
                            default -> { }
                        }
                    } else if ("p".equals(name)) {
                        text.append('\n');
                    }
                    if (text.length() > MAX_CHARS) throw new InvalidDocument("TEXT_LIMIT_OR_INVALID");
                }
            }
            return text.toString();
        } finally {
            reader.close();
        }
    }

    private static boolean isWordNamespace(String namespace) {
        return "http://schemas.openxmlformats.org/wordprocessingml/2006/main".equals(namespace)
                || "http://purl.oclc.org/ooxml/wordprocessingml/main".equals(namespace);
    }

    private void readPdf(Path path, List<Chunk> result) throws IOException {
        try (var pdf = Loader.loadPDF(path.toFile())) {
            if (pdf.isEncrypted()) {
                throw new InvalidDocument("ENCRYPTED_PDF");
            }
            if (pdf.getNumberOfPages() > MAX_PAGES) {
                throw new InvalidDocument("PAGE_LIMIT");
            }
            PDFTextStripper stripper = new PDFTextStripper();
            int characters = 0;
            for (int page = 1; page <= pdf.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                PageText output = new PageText(MAX_CHARS - characters);
                stripper.writeText(pdf, output);
                String text = output.text.toString();
                characters += text.length();
                split(text, page, null, result);
            }
        } catch (org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException ex) {
            throw new InvalidDocument("ENCRYPTED_PDF");
        }
    }

    private static class PageText extends Writer {
        private final StringBuilder text = new StringBuilder();
        private final int limit;

        PageText(int limit) {
            this.limit = limit;
        }

        @Override
        public void write(char[] chars, int offset, int length) {
            if (length > limit - text.length()) {
                throw new InvalidDocument("TEXT_LIMIT_OR_INVALID");
            }
            text.append(chars, offset, length);
        }

        @Override
        public void flush() {}

        @Override
        public void close() {}
    }

    private void splitMarkdown(String text, List<Chunk> result) {
        var headings = MARKDOWN_HEADING.matcher(text);
        int start = 0;
        String section = null;
        while (headings.find()) {
            split(text.substring(start, headings.start()), null, section, result);
            start = headings.start();
            String heading = headings.group(1).strip();
            int length = Math.min(heading.codePointCount(0, heading.length()), 300);
            section = heading.substring(0, heading.offsetByCodePoints(0, length));
        }
        split(text.substring(start), null, section, result);
    }

    private void split(String raw, Integer page, String section, List<Chunk> result) {
        String text = raw.replace("\r\n", "\n").strip();
        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + CHUNK_LENGTH, text.length());
            if (end < text.length()) {
                int boundary = Math.max(text.lastIndexOf(' ', end), text.lastIndexOf('\n', end));
                if (boundary > start + CHUNK_LENGTH / 2) {
                    end = boundary;
                } else if (Character.isLowSurrogate(text.charAt(end))) {
                    end--;
                }
            }
            String part = text.substring(start, end).strip();
            if (!part.isEmpty()) {
                if (result.size() >= MAX_CHUNKS) {
                    throw new InvalidDocument("CHUNK_LIMIT");
                }
                result.add(new Chunk(part, page, section, (part.length() + 2) / 3));
            }
            if (end == text.length()) {
                break;
            }
            start = end - OVERLAP;
            if (Character.isLowSurrogate(text.charAt(start))) {
                start++;
            }
        }
    }

    public static class InvalidDocument extends RuntimeException {
        public InvalidDocument(String code) {
            super(code);
        }
    }
}
