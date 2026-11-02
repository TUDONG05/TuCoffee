package com.tuscoffee.dto;

public record GoogleLoginConfig(boolean enabled, String clientId, String nonce) {
    @Override public String toString() { return "GoogleLoginConfig[enabled=" + enabled + ", nonce redacted]"; }
}
