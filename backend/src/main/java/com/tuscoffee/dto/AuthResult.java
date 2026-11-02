package com.tuscoffee.dto;

import java.time.Instant;

/** Internal service result; controllers return response(), never this refresh-bearing record. */
public record AuthResult(
        AuthResponse response,
        String refreshToken,
        Instant refreshExpiry
) {
    @Override
    public String toString() {
        return "AuthResult[tokens redacted]";
    }
}
