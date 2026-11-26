package com.tuscoffee.dto;

/** Only populated from a cryptographically verified Google ID token. */
public record GoogleIdentity(String subject, String email, String name) {}
