package com.tuscoffee.dto;

import java.util.List;

public final class ChatDtos {
    private ChatDtos() {}

    public record Question(String question, List<Turn> context) {}
    public record Turn(String role, String content) {}
    public record Answer(String answer, List<Citation> citations, List<Product> products, boolean insufficientData) {}
    public record Citation(long documentId, String title, Integer page, String section) {}
    public record Product(long id, String name, long priceVnd, String imageUrl) {}
    public record Config(boolean enabled) {}
}
