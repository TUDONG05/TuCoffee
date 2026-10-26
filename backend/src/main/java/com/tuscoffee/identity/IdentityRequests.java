package com.tuscoffee.identity;

import com.fasterxml.jackson.annotation.JsonProperty;

public final class IdentityRequests {
    private IdentityRequests() { }
    public record Register(String name, String email, String password) {
        @Override public String toString() { return "Register[credentials redacted]"; }
    }
    public record Login(String email, String password) {
        @Override public String toString() { return "Login[credentials redacted]"; }
    }
    public record Profile(@JsonProperty(required = true) String name,
                          @JsonProperty(required = true) String phone,
                          @JsonProperty(required = true) String address) { }
    public record Password(String currentPassword, String newPassword) {
        @Override public String toString() { return "Password[credentials redacted]"; }
    }
    public record Active(Boolean active) { }
}
