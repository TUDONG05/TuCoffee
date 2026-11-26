package com.tuscoffee.service;

import com.tuscoffee.exception.ApiException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
public class TurnstileService {
    private final boolean enabled;
    private final String siteKey;
    private final String secretKey;
    private final Set<String> hostnames;
    private final HttpClient http;
    private final JsonMapper json = JsonMapper.builder().build();
    @Autowired
    public TurnstileService(@Value("${turnstile.enabled:false}") boolean enabled,
        @Value("${turnstile.site-key:}") String siteKey,
        @Value("${turnstile.secret-key:}") String secretKey,
        @Value("${turnstile.hostnames:localhost,127.0.0.1}") String hostnames) {
        this(enabled,siteKey,secretKey,hostnames,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
    }
    TurnstileService(boolean enabled,String siteKey,String secretKey,String hostnames,HttpClient http) {
        this.enabled=enabled; this.siteKey=siteKey; this.secretKey=secretKey; this.http=http;
        this.hostnames=new HashSet<>();
        Arrays.stream(hostnames.split(",")).map(String::trim).filter(s->!s.isEmpty()).forEach(this.hostnames::add);
        if(enabled && (siteKey.isBlank() || secretKey.isBlank() || this.hostnames.isEmpty()))
            throw new IllegalStateException("Turnstile enabled: site key, secret key and hostnames are required.");
    }
    public record Config(boolean enabled,String siteKey) {}
    public Config config(){return new Config(enabled,enabled?siteKey:null);}
    public void verify(String token,String expectedAction) {
        if(!enabled) return;
        if(token==null || token.isBlank()) throw new ApiException(400,"TURNSTILE_REQUIRED","Vui lòng hoàn tất xác minh Cloudflare.");
        if(token.length()>2048) throw invalid();
        try {
            String body="secret="+URLEncoder.encode(secretKey,StandardCharsets.UTF_8)+"&response="+URLEncoder.encode(token,StandardCharsets.UTF_8);
            var request=HttpRequest.newBuilder(URI.create("https://challenges.cloudflare.com/turnstile/v0/siteverify"))
                .timeout(Duration.ofSeconds(5)).header("Content-Type","application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            var response=http.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200) throw unavailable();
            var result=json.readTree(response.body());
            if(result==null || !result.path("success").isBoolean()) throw unavailable();
            if(!result.path("success").asBoolean() || !expectedAction.equals(result.path("action").asText())
                || !hostnames.contains(result.path("hostname").asText())) throw invalid();
        } catch(ApiException e){throw e;}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw unavailable();}
        catch(Exception e){throw unavailable();}
    }
    private ApiException invalid(){return new ApiException(400,"TURNSTILE_INVALID","Xác minh không hợp lệ hoặc đã hết hạn. Vui lòng xác minh lại.");}
    private ApiException unavailable(){return new ApiException(503,"TURNSTILE_UNAVAILABLE","Chưa thể xác minh Cloudflare. Vui lòng thử lại.");}
}
