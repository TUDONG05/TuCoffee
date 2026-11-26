package com.tuscoffee.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.tuscoffee.exception.ApiException;
import java.time.Clock;
import org.junit.jupiter.api.Test;

class ChatQuotaServiceTests {
    @Test
    void sharesIpBudgetBetweenGuestAndAuthenticatedRequests() {
        var quotas = new ChatQuotaService(Clock.systemUTC(), 1, 5, 10, 2, 4);
        try (var first = quotas.acquire("192.0.2.1", null)) {
            assertEquals(429, assertThrows(ApiException.class,
                    () -> quotas.acquire("192.0.2.1", 12L)).status());
        }
        try (var unrelated = quotas.acquire("192.0.2.2", 12L)) {
            // A distinct IP still has capacity.
        }
    }
}
