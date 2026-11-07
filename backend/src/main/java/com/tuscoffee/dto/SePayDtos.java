package com.tuscoffee.dto;

public final class SePayDtos {
    private SePayDtos() {}

    public record SePayWebhookRequest(
            Long id,
            String gateway,
            String transactionDate,
            String accountNumber,
            String subAccount,
            String code,
            String content,
            String transferType,
            String description,
            Long transferAmount,
            Long accumulated,
            String referenceCode
    ) {}

    public record SePayWebhookResponse(
            boolean success,
            String message
    ) {}
}
