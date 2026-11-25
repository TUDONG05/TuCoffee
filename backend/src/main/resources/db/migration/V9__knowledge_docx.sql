ALTER TABLE knowledge_versions DROP CHECK ck_knowledge_type;
ALTER TABLE knowledge_versions
    MODIFY content_type VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ADD CONSTRAINT ck_knowledge_type CHECK (content_type IN (
        'text/plain', 'text/markdown', 'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ));
