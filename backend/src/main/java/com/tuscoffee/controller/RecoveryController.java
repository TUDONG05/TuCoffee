package com.tuscoffee.controller;

import com.tuscoffee.service.RecoveryService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class RecoveryController {
    private final RecoveryService recovery;
    public RecoveryController(RecoveryService recovery) { this.recovery=recovery; }
    public record ForgotRequest(String email) {}
    public record ResetRequest(String challengeId,String code,String newPassword) {}
    @PostMapping("/forgot-password")
    public ResponseEntity<RecoveryService.Challenge> request(@RequestBody ForgotRequest input,HttpServletRequest request) {
        return ResponseEntity.accepted().header("Cache-Control","no-store").body(recovery.request(input.email(),request.getRemoteAddr()));
    }
    @PostMapping("/reset-password")
    public ResponseEntity<Void> reset(@RequestBody ResetRequest input) {
        recovery.reset(input.challengeId(),input.code(),input.newPassword());
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
}
