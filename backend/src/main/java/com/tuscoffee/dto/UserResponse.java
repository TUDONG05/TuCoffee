package com.tuscoffee.dto;

import com.tuscoffee.entity.User;

/** Public account fields only; entities and password hashes never leave the service boundary. */
public record UserResponse(
        long id,
        String name,
        String email,
        String phone,
        String address,
        String role,
        boolean active,
        boolean passwordLoginAvailable
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhone(),
                user.getAddress(),
                user.getRole(),
                user.isActive(),
                user.getPasswordHash() != null);
    }
}
