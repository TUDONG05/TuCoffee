package com.tuscoffee.dto;

public record RegisterRequest(
        String name,
        String email,
        String password
) {
    @Override
    public String toString() {
        return "RegisterRequest[credentials redacted]";
    }
}
