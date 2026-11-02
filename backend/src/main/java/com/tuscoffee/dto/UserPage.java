package com.tuscoffee.dto;

import java.util.List;

public record UserPage(
        List<UserResponse> items,
        int page,
        int size,
        long totalItems,
        int totalPages
) {
}
