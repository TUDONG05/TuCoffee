package com.tuscoffee.controller;

import com.tuscoffee.dto.ReviewDtos.*;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.ReviewService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/admin/reviews")
public class ReviewAdminController {
    private final ReviewService service;
    public ReviewAdminController(ReviewService service) {
        this.service = service;
    }

    @GetMapping public ReviewPage list(@RequestParam(required = false) Long productId, @RequestParam(required = false) Integer stars, @RequestParam(required = false) Boolean visible, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.adminPage(productId, stars, visible, page, size);
    }

    @GetMapping("/{id}") public Detail detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PatchMapping("/{id}/visibility") public ReviewResponse moderate(@PathVariable long id, @AuthenticationPrincipal IdentityPrincipal principal, @RequestBody ModerateReview input) {
        return service.moderate(id, principal.user().id(), input);
    }
}
