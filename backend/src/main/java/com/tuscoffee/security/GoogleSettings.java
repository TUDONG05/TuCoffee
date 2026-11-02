package com.tuscoffee.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("auth.google")
public record GoogleSettings(String clientId) {
    public boolean enabled() { return clientId != null && !clientId.isBlank(); }
}
