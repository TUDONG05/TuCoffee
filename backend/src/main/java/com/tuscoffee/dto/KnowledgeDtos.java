package com.tuscoffee.dto;

import java.time.Instant;
import java.util.List;

public final class KnowledgeDtos {
    private KnowledgeDtos() {}

    public record Revision(long id, int revision, String status, String errorCode,
                           String originalFilename) {}

    public record Document(long id, String title, boolean enabled, long version,
                           Long activeVersionId, long chunkCount, Instant createdAt, Instant updatedAt, Revision latestVersion,
                           List<Revision> versions) {}

    public record Page(List<Document> items, long total, int page, int size) {}
    public record Queued(long documentId, long versionId, long jobId) {}
    public record Enabled(Boolean enabled, Long version) {}
    public record Preview(List<String> excerpts, boolean truncated) {}
}
