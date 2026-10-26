package com.tuscoffee.identity.security;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("auth")
public record AuthSettings(String jwtSecret, List<String> allowedOrigins, boolean cookieSecure) {
    @Override public String toString() { return "AuthSettings[secret redacted, cookieSecure=" + cookieSecure + "]"; }
}
