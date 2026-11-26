package com.tuscoffee.dto;

import java.util.List;

public final class ChatDtos {
    private ChatDtos() {}

    public record Question(String question, List<Turn> context) {}
    public record Turn(String role, String content) {}
    public record Answer(String answer, List<Citation> citations, List<Product> products,
                         boolean insufficientData, CartProposal cartProposal) {
        public Answer(String answer, List<Citation> citations, List<Product> products, boolean insufficientData) {
            this(answer, citations, products, insufficientData, null);
        }
    }
    public record CartProposal(long productId, int quantity) {}
    public record Citation(long documentId, String title, Integer page, String section) {}
    public record Product(long id, String name, long priceVnd, String imageUrl) {}
    public record Config(boolean enabled) {}
}
