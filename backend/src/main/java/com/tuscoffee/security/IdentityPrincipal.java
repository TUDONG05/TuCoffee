package com.tuscoffee.security;

import com.tuscoffee.dto.UserResponse;

public record IdentityPrincipal(UserResponse user, String sessionId) {}
