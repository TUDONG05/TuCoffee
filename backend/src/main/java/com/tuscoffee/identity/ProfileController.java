package com.tuscoffee.identity;

import com.tuscoffee.identity.security.IdentityPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users/me")
public class ProfileController {
    private final IdentityService identity;
    private final AuthController cookies;
    public ProfileController(IdentityService identity, AuthController cookies) { this.identity = identity; this.cookies = cookies; }
    @GetMapping
    public User me(@AuthenticationPrincipal IdentityPrincipal principal) { return identity.me(principal); }
    @PatchMapping
    public User update(@AuthenticationPrincipal IdentityPrincipal principal, @RequestBody IdentityRequests.Profile input) {
        return identity.profile(principal, input);
    }
    @PutMapping("/password")
    public IdentityService.AuthResponse password(@AuthenticationPrincipal IdentityPrincipal principal,
            @RequestBody IdentityRequests.Password input, HttpServletRequest request, HttpServletResponse response) {
        var result = identity.password(principal, input);
        cookies.authenticatedCookies(result, request, response, true);
        return result.response();
    }
}
