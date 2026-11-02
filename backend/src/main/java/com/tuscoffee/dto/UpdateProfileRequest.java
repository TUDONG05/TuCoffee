package com.tuscoffee.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record UpdateProfileRequest(
        @JsonProperty(required = true) String name,
        @JsonProperty(required = true) String phone,
        @JsonProperty(required = true) String address
) {
}
