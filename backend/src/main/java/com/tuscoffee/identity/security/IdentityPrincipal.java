package com.tuscoffee.identity.security;

import com.tuscoffee.identity.User;

public record IdentityPrincipal(User user, String sessionId) { }
