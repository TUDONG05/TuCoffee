package com.tuscoffee.controller;

import com.tuscoffee.dto.AuthResponse;
import com.tuscoffee.dto.ChangePasswordRequest;
import com.tuscoffee.dto.UpdateProfileRequest;
import com.tuscoffee.dto.UserResponse;
import com.tuscoffee.service.IdentityService;
import com.tuscoffee.security.IdentityPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users/me")
public class ProfileController {
    private final IdentityService identity;
    private final AuthController cookies;

    public ProfileController(IdentityService identity, AuthController cookies) {
        this.identity = identity;
        this.cookies = cookies;
    }

    @GetMapping
    public UserResponse me(@AuthenticationPrincipal IdentityPrincipal principal) {
        return identity.me(principal);
    }

    @PatchMapping
    public UserResponse update(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @RequestBody UpdateProfileRequest input) {
        return identity.profile(principal, input);
    }

    @PutMapping("/password")
    public AuthResponse password(
            @AuthenticationPrincipal IdentityPrincipal principal,
            @RequestBody ChangePasswordRequest input,
            HttpServletRequest request,
            HttpServletResponse response) {
        var result = identity.password(principal, input);
        cookies.authenticatedCookies(result, request, response, true);
        return result.response();
    }
}
