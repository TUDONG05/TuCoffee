package com.tuscoffee.controller;

import com.tuscoffee.dto.ChatDtos.Answer;
import com.tuscoffee.dto.ChatDtos.Config;
import com.tuscoffee.dto.ChatDtos.Question;
import com.tuscoffee.dto.ChatDtos.Turn;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.ChatAnswerService;
import com.tuscoffee.service.ChatQuotaService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {
    private static final int MAX_BODY_BYTES = 64 * 1024;
    private static final int MAX_QUESTION_LENGTH = 2000;
    private static final int MAX_CONTEXT_LENGTH = 6000;
    private static final int MAX_CONTEXT_TURNS = 6;

    private final boolean enabled;
    private final String trustedProxy;
    private final ObjectMapper mapper;
    private final ChatQuotaService quotas;
    private final ObjectProvider<ChatAnswerService> answers;

    public ChatController(@Value("${RAG_CHAT_ENABLED:false}") boolean enabled,
                          @Value("${RAG_CHAT_TRUSTED_PROXY_IP:}") String proxy,
                          ObjectMapper mapper, ChatQuotaService quotas,
                          ObjectProvider<ChatAnswerService> answers) {
        this.enabled = enabled;
        this.trustedProxy = numericAddress(proxy);
        if (!proxy.isBlank() && trustedProxy == null) {
            throw new IllegalArgumentException("RAG_CHAT_TRUSTED_PROXY_IP must be an IP address");
        }
        this.mapper = mapper;
        this.quotas = quotas;
        this.answers = answers;
    }

    @GetMapping("/config")
    public ResponseEntity<Config> config() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Config(enabled));
    }

    @PostMapping(value = "/messages", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Answer> message(HttpServletRequest request,
                                          @AuthenticationPrincipal IdentityPrincipal principal) {
        if (!enabled) {
            throw new ApiException(503, "CHAT_DISABLED", "Trợ lý hiện chưa được bật.");
        }
        Question input = normalize(readQuestion(request));
        Long account = principal == null ? null : principal.user().id();
        try (var permit = quotas.acquire(clientIp(request), account)) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(answers.getObject().answer(input));
        }
    }

    private Question readQuestion(HttpServletRequest request) {
        if (request.getContentLengthLong() > MAX_BODY_BYTES) throw invalid();
        try {
            byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
            if (body.length > MAX_BODY_BYTES) throw invalid();
            return mapper.readerFor(Question.class).with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(body);
        } catch (IOException | JacksonException ex) {
            throw invalid();
        }
    }

    private static Question normalize(Question input) {
        if (input == null || input.question() == null || input.question().length() > MAX_QUESTION_LENGTH
                || input.question().isBlank()) throw invalid();
        if (input.context() == null) return new Question(input.question().strip(), List.of());
        if (input.context().size() > MAX_CONTEXT_TURNS) throw invalid();
        int length = 0;
        List<Turn> turns = new ArrayList<>(input.context().size());
        for (Turn turn : input.context()) {
            if (turn == null || (!"user".equals(turn.role()) && !"assistant".equals(turn.role()))
                    || turn.content() == null || turn.content().isBlank()
                    || turn.content().length() > MAX_QUESTION_LENGTH) throw invalid();
            length += turn.content().length();
            if (length > MAX_CONTEXT_LENGTH) throw invalid();
            turns.add(new Turn(turn.role(), turn.content().strip()));
        }
        return new Question(input.question().strip(), List.copyOf(turns));
    }

    private String clientIp(HttpServletRequest request) {
        String remote = numericAddress(request.getRemoteAddr());
        if (trustedProxy != null && trustedProxy.equals(remote)) {
            String forwarded = numericAddress(request.getHeader("X-Real-IP"));
            if (forwarded != null) return forwarded;
        }
        return remote == null ? "unknown" : remote;
    }

    private static String numericAddress(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > 45
                || !(raw.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")
                || (raw.contains(":") && raw.matches("[0-9A-Fa-f:.]+")))) return null;
        try {
            return InetAddress.getByName(raw).getHostAddress();
        } catch (UnknownHostException ex) {
            return null;
        }
    }

    private static ApiException invalid() {
        return new ApiException(400, "CHAT_INVALID_INPUT", "Câu hỏi hoặc nội dung hội thoại không hợp lệ.");
    }
}
