package com.tuscoffee.dto;

public record GoogleLoginRequest(String credential, String currentPassword) {
    @Override public String toString() { return "GoogleLoginRequest[credentials redacted]"; }
}
