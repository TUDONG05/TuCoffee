package com.tuscoffee.service;

import com.tuscoffee.exception.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

@Service
public class ChatQuotaService {
    private static final long MINUTE_MS = 60_000;
    private static final int MAX_IDENTITIES = 20_000;
    private final Map<String, Usage> usage = new HashMap<>();
    private final Clock clock;
    private final int requestsPerIp;
    private final int requestsPerAccount;
    private final int dailyLimit;
    private final int concurrentPerIdentity;
    private final int concurrentGlobally;
    private LocalDate day;
    private int dailyRequests;
    private int inFlight;
    private long nextCleanup;

    @Autowired
    public ChatQuotaService(
            @Value("${RAG_CHAT_REQUESTS_PER_IP_MINUTE:10}") int requestsPerIp,
            @Value("${RAG_CHAT_REQUESTS_PER_USER_MINUTE:10}") int requestsPerAccount,
            @Value("${RAG_CHAT_DAILY_LIMIT:500}") int dailyLimit,
            @Value("${RAG_CHAT_MAX_CONCURRENT_PER_IDENTITY:2}") int concurrentPerIdentity,
            @Value("${RAG_CHAT_MAX_CONCURRENT:20}") int concurrentGlobally) {
        this(Clock.systemUTC(), requestsPerIp, requestsPerAccount, dailyLimit,
                concurrentPerIdentity, concurrentGlobally);
    }

    ChatQuotaService(Clock clock, int requestsPerIp, int requestsPerAccount, int dailyLimit,
                     int concurrentPerIdentity, int concurrentGlobally) {
        if (requestsPerIp < 1 || requestsPerIp > 1_000 || requestsPerAccount < 1 || requestsPerAccount > 1_000
                || dailyLimit < 1 || concurrentPerIdentity < 1 || concurrentGlobally < concurrentPerIdentity) {
            throw new IllegalArgumentException("Invalid RAG chat quota configuration");
        }
        this.clock = clock;
        this.requestsPerIp = requestsPerIp;
        this.requestsPerAccount = requestsPerAccount;
        this.dailyLimit = dailyLimit;
        this.concurrentPerIdentity = concurrentPerIdentity;
        this.concurrentGlobally = concurrentGlobally;
    }

    public synchronized Permit acquire(String ip, Long account) {
        long now = clock.millis();
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        if (!today.equals(day)) {
            day = today;
            dailyRequests = 0;
        }
        if (dailyRequests >= dailyLimit) {
            throw limited("CHAT_DAILY_LIMIT", "Trợ lý đã đạt giới hạn trong ngày. Vui lòng quay lại sau.");
        }
        if (inFlight >= concurrentGlobally) throw busy();

        if (now >= nextCleanup) {
            usage.values().removeIf(state -> {
                state.expire(now);
                return state.inFlight == 0 && state.requests.isEmpty();
            });
            nextCleanup = now + MINUTE_MS;
        }
        String ipKey = "ip:" + ip;
        String accountKey = account == null ? null : "user:" + account;
        Usage ipUsage = usage.get(ipKey);
        Usage accountUsage = accountKey == null ? null : usage.get(accountKey);
        check(ipUsage, requestsPerIp, now);
        check(accountUsage, requestsPerAccount, now);
        int newIdentities = (ipUsage == null ? 1 : 0) + (accountKey != null && accountUsage == null ? 1 : 0);
        if (usage.size() + newIdentities > MAX_IDENTITIES) throw busy();

        ipUsage = usage.computeIfAbsent(ipKey, key -> new Usage());
        ipUsage.accept(now);
        if (accountKey != null) {
            accountUsage = usage.computeIfAbsent(accountKey, key -> new Usage());
            accountUsage.accept(now);
        }
        dailyRequests++;
        inFlight++;
        return new Permit(ipUsage, accountUsage);
    }

    private void check(Usage state, int limit, long now) {
        if (state == null) return;
        state.expire(now);
        if (state.requests.size() >= limit) {
            throw limited("CHAT_RATE_LIMITED", "Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau.");
        }
        if (state.inFlight >= concurrentPerIdentity) throw busy();
    }

    private static ApiException busy() {
        return limited("CHAT_BUSY", "Trợ lý đang xử lý nhiều yêu cầu. Vui lòng thử lại sau.");
    }

    private static ApiException limited(String code, String message) {
        return new ApiException(429, code, message);
    }

    public final class Permit implements AutoCloseable {
        private final Usage ip;
        private final Usage account;
        private boolean closed;

        private Permit(Usage ip, Usage account) {
            this.ip = ip;
            this.account = account;
        }

        @Override
        public void close() {
            synchronized (ChatQuotaService.this) {
                if (closed) return;
                closed = true;
                ip.inFlight--;
                if (account != null) account.inFlight--;
                inFlight--;
            }
        }
    }

    private static final class Usage {
        private final ArrayDeque<Long> requests = new ArrayDeque<>();
        private int inFlight;

        void expire(long now) {
            while (!requests.isEmpty() && requests.getFirst() <= now - MINUTE_MS) {
                requests.removeFirst();
            }
        }

        void accept(long now) {
            requests.addLast(now);
            inFlight++;
        }
    }
}
