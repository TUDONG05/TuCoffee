package com.tuscoffee.controller;

import com.tuscoffee.dto.ReviewDtos.*;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.ReviewService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/products/{productId}/reviews")
public class ReviewController {
    private final ReviewService service;
    public ReviewController(ReviewService service) {
        this.service = service;
    }

    @GetMapping public ReviewPage list(@PathVariable long productId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return service.publicPage(productId, page, size);
    }

    @GetMapping("/mine") public Mine mine(@PathVariable long productId, @AuthenticationPrincipal IdentityPrincipal principal) {
        return service.mine(productId, principal.user().id());
    }

    @PutMapping("/mine") public ReviewResponse write(@PathVariable long productId, @AuthenticationPrincipal IdentityPrincipal principal, @RequestBody WriteReview input) {
        return service.write(productId, principal.user().id(), input);
    }
}
