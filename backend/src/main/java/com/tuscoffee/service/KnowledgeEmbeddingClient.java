package com.tuscoffee.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@ConditionalOnExpression("${RAG_WORKER_ENABLED:false} or ${RAG_CHAT_ENABLED:false}")
public class KnowledgeEmbeddingClient {
    private static final int MAX_RESPONSE_BYTES = 512 * 1024;
    private final URI url;
    private final String key;
    private final String model;
    private final int dimensions;
    private final Duration timeout;
    private final ObjectMapper mapper;
    private final HttpClient client;

    public KnowledgeEmbeddingClient(
            @Value("${RAG_EMBEDDING_URL:}") String endpoint,
            @Value("${RAG_EMBEDDING_API_KEY:}") String key,
            @Value("${RAG_EMBEDDING_MODEL:}") String model,
            @Value("${RAG_EMBEDDING_DIMENSIONS:0}") int dimensions,
            @Value("${RAG_EMBEDDING_TIMEOUT_SECONDS:15}") int timeoutSeconds,
            ObjectMapper mapper) {
        this.url = URI.create(endpoint);
        String host = url.getHost();
        boolean loopback = "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
        if (host == null || url.getUserInfo() != null || url.getFragment() != null
                || !("https".equalsIgnoreCase(url.getScheme())
                || loopback && "http".equalsIgnoreCase(url.getScheme()))
                || model.isBlank() || model.length() > 150 || dimensions < 1 || dimensions > 4096
                || timeoutSeconds < 1 || timeoutSeconds > 60) {
            throw new IllegalArgumentException("Invalid embedding configuration");
        }
        this.key = key;
        this.model = model;
        this.dimensions = dimensions;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.mapper = mapper;
        this.client = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public String model() {
        return model;
    }

    public int dimensions() {
        return dimensions;
    }

    public String embed(String input) throws Exception {
        var request = HttpRequest.newBuilder(url).timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(
                        Map.of("model", model, "input", input, "dimensions", dimensions))));
        if (!key.isBlank()) {
            request.header("Authorization", "Bearer " + key);
        }
        var response = client.send(request.build(), ignored -> new BoundedBody());
        if (response.statusCode() != 200) {
            throw new EmbeddingFailure(response.statusCode() == 429 || response.statusCode() >= 500
                    ? "EMBEDDING_UNAVAILABLE" : "EMBEDDING_REJECTED",
                    response.statusCode() == 429 || response.statusCode() >= 500);
        }
        var embedding = mapper.readTree(response.body()).path("data").path(0).path("embedding");
        if (!embedding.isArray() || embedding.size() != dimensions) {
            throw new EmbeddingFailure("INVALID_EMBEDDING", false);
        }
        for (var coordinate : embedding) {
            if (!coordinate.isNumber() || !Double.isFinite(coordinate.asDouble())) {
                throw new EmbeddingFailure("INVALID_EMBEDDING", false);
            }
        }
        return mapper.writeValueAsString(embedding);
    }

    static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long bytes;

        @Override public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        @Override public void onComplete() { delegate.onComplete(); }
        @Override public void onError(Throwable error) { delegate.onError(error); }

        @Override public void onSubscribe(Flow.Subscription value) {
            subscription = value;
            delegate.onSubscribe(value);
        }

        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                bytes += buffer.remaining();
            }
            if (bytes > MAX_RESPONSE_BYTES) {
                subscription.cancel();
                delegate.onError(new java.io.IOException("Embedding response exceeds size limit"));
                return;
            }
            delegate.onNext(buffers);
        }
    }

    static class EmbeddingFailure extends RuntimeException {
        final boolean retryable;

        EmbeddingFailure(String code, boolean retryable) {
            super(code);
            this.retryable = retryable;
        }
    }
}
