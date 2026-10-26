package com.tuscoffee.identity;

public record User(long id, String name, String email, String phone, String address,
                   String role, boolean active) { }
