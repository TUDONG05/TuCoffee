package com.tuscoffee.dto;

public record ChangePasswordRequest(
        String currentPassword,
        String newPassword
) {
    @Override
    public String toString() {
        return "ChangePasswordRequest[credentials redacted]";
    }
}
