package com.tuscoffee.dto;

public record AuthResponse(
    String accessToken,
    long expiresIn,
    UserResponse user
) {
    @Override
    public String toString() {
        return "AuthResponse[tokens redacted]";
    }
}
