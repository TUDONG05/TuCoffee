package com.tuscoffee.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class KnowledgeTextExtractorTests {
    private final KnowledgeTextExtractor extractor = new KnowledgeTextExtractor();
    @TempDir Path storage;

    @Test
    void markdownKeepsSectionAndUtf8Text() throws Exception {
        var file = Files.writeString(storage.resolve("menu"), "# Thực đơn\nCà phê\n## Chính sách\nMua tại quầy");
        var chunks = extractor.extract(file, "text/markdown");
        assertEquals(2, chunks.size());
        assertEquals("Thực đơn", chunks.getFirst().section());
        assertEquals("# Thực đơn\nCà phê", chunks.getFirst().text());
        assertEquals("Chính sách", chunks.getLast().section());
    }

    @Test
    void rejectsMalformedUtf8() throws Exception {
        var file = Files.write(storage.resolve("invalid"), new byte[] {(byte) 0xc3, 0x28});
        assertThrows(CharacterCodingException.class, () -> extractor.extract(file, "text/plain"));
    }

    @Test
    void extractsWordParagraphsAndRejectsNonWordFiles() throws Exception {
        Path file = storage.resolve("menu.docx");
        try (var archive = new ZipOutputStream(Files.newOutputStream(file))) {
            writeEntry(archive, "[Content_Types].xml", "<Types/>");
            writeEntry(archive, "word/document.xml", """
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                      <w:body>
                        <w:p><w:r><w:t>Thực đơn</w:t></w:r></w:p>
                        <w:p><w:r><w:t>Cà phê sữa</w:t></w:r></w:p>
                      </w:body>
                    </w:document>
                    """);
        }
        assertEquals("Thực đơn\nCà phê sữa",
                extractor.extract(file, KnowledgeTextExtractor.DOCX_TYPE).getFirst().text());
        Path invalid = Files.writeString(storage.resolve("invalid.docx"), "Plain text");
        assertEquals("INVALID_DOCX", assertThrows(KnowledgeTextExtractor.InvalidDocument.class,
                () -> extractor.extract(invalid, KnowledgeTextExtractor.DOCX_TYPE)).getMessage());
    }

    private static void writeEntry(ZipOutputStream archive, String name, String content) throws Exception {
        archive.putNextEntry(new ZipEntry(name));
        archive.write(content.getBytes(StandardCharsets.UTF_8));
        archive.closeEntry();
    }

    @Test
    void extractsPdfWithPageNumbersAndRejectsPdfWithoutText() throws Exception {
        Path file = storage.resolve("document");
        try (var pdf = new PDDocument()) {
            var page = new PDPage();
            pdf.addPage(page);
            pdf.save(file.toFile());
            assertEquals("NO_EXTRACTABLE_TEXT", assertThrows(KnowledgeTextExtractor.InvalidDocument.class,
                    () -> extractor.extract(file, "application/pdf")).getMessage());

            try (var stream = new PDPageContentStream(pdf, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(30, 100);
                stream.showText("Coffee");
                stream.endText();
            }
            pdf.save(file.toFile());
        }
        var chunk = extractor.extract(file, "application/pdf").getFirst();
        assertEquals("Coffee", chunk.text());
        assertEquals(1, chunk.page());
    }
}
