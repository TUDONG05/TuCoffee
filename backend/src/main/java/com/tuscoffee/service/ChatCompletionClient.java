package com.tuscoffee.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(name = "RAG_CHAT_ENABLED", havingValue = "true")
public class ChatCompletionClient {
    private final HttpClient client;
    private final ObjectMapper mapper;
    private final URI endpoint;
    private final String model;
    private final String key;
    private final Duration timeout;

    public ChatCompletionClient(ObjectMapper mapper,
            @Value("${RAG_CHAT_URL:https://generativelanguage.googleapis.com/v1beta/openai/chat/completions}") String url,
            @Value("${RAG_CHAT_MODEL:gemini-3.1-flash-lite}") String model,
            @Value("${RAG_CHAT_API_KEY:}") String key,
            @Value("${RAG_EMBEDDING_API_KEY:}") String embeddingKey,
            @Value("${RAG_CHAT_TIMEOUT_SECONDS:20}") int seconds) {
        endpoint = URI.create(url);
        String host = endpoint.getHost();
        boolean local = "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
        if (host == null || endpoint.getUserInfo() != null || endpoint.getFragment() != null
                || !("https".equalsIgnoreCase(endpoint.getScheme()) || local && "http".equalsIgnoreCase(endpoint.getScheme()))
                || model.isBlank() || seconds < 1 || seconds > 60) {
            throw new IllegalArgumentException("Invalid chat configuration");
        }
        this.mapper = mapper;
        this.model = model;
        this.key = key.isBlank() ? embeddingKey : key;
        timeout = Duration.ofSeconds(seconds);
        client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(timeout).build();
    }

    JsonNode generate(String system, Object prompt) throws Exception {
        var payload = new HashMap<String, Object>(Map.of(
                "model", model,
                "max_tokens", 800,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", mapper.writeValueAsString(prompt)))));
        if (model.startsWith("gemini-2.5-flash")) payload.put("reasoning_effort", "none");
        var request = HttpRequest.newBuilder(endpoint).timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)));
        if (!key.isBlank()) request.header("Authorization", "Bearer " + key);
        var response = client.send(request.build(), ignored -> new KnowledgeEmbeddingClient.BoundedBody());
        if (response.statusCode() != 200) throw new IllegalStateException("Chat provider unavailable");
        var content = mapper.readTree(response.body()).path("choices").path(0).path("message").path("content");
        if (!content.isTextual()) throw new IllegalStateException("Chat provider returned no response");
        return mapper.readTree(content.asText());
    }
}
