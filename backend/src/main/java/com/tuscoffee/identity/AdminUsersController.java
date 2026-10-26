package com.tuscoffee.identity;

import com.tuscoffee.identity.security.IdentityPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUsersController {
    private final IdentityService identity;
    public AdminUsersController(IdentityService identity) { this.identity = identity; }
    @GetMapping
    public IdentityStore.UserPage users(@AuthenticationPrincipal IdentityPrincipal principal,
            @RequestParam(defaultValue="") String q, @RequestParam(required=false) Boolean active,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="12") int size) {
        return identity.users(principal, q, active, page, size);
    }
    @PatchMapping("/{id}/active")
    public User active(@AuthenticationPrincipal IdentityPrincipal principal, @PathVariable long id,
                       @RequestBody IdentityRequests.Active input) { return identity.active(principal, id, input); }
}
