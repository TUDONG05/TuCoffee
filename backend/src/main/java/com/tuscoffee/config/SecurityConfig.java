package com.tuscoffee.config;

import com.tuscoffee.service.IdentityService;
import com.tuscoffee.security.AuthSettings;
import com.tuscoffee.security.IdentityAuthenticationFilter;
import com.tuscoffee.security.OriginFilter;
import com.tuscoffee.security.TokenService;
import com.tuscoffee.exception.ApiErrors;
import jakarta.servlet.DispatcherType;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableConfigurationProperties({AuthSettings.class, com.tuscoffee.security.GoogleSettings.class, PaymentSettings.class})
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    UserDetailsService noInteractiveAuthentication() {
        // All credentials are processed by IdentityService; suppress generated default
        // credentials.
        return username -> {
            throw new UsernameNotFoundException("Authentication requires the identity API.");
        };
    }

    @Bean
    CookieCsrfTokenRepository csrfRepository(AuthSettings settings) {
        var repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(
                cookie -> cookie.path("/").sameSite("Strict").secure(settings.cookieSecure()));
        return repository;
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            AuthSettings settings,
            TokenService tokens,
            IdentityService identity,
            ApiErrors errors,
            CookieCsrfTokenRepository csrf)
            throws Exception {
        http.sessionManagement(
                        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(config -> config.spa().csrfTokenRepository(csrf))
                .cors(cors -> cors.configurationSource(corsSource(settings)))
                .requestCache(cache -> cache.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .authorizeHttpRequests(
                        authorize ->
                                authorize
                                        .dispatcherTypeMatchers(DispatcherType.ERROR)
                                        .permitAll()
                                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                                "/api/v1/categories", "/api/v1/products", "/api/v1/products/**",
                                                "/api/v1/catalog/images/**",
                                                "/api/v1/orders/vnpay-ipn",
                                                "/api/v1/orders/vnpay-return").permitAll()
                                        .requestMatchers("/api/v1/admin/**")
                                        .hasRole("ADMIN")
                                        .requestMatchers("/api/v1/users/**", "/api/v1/orders", "/api/v1/orders/**")
                                        .authenticated()
                                        .requestMatchers(
                                                "/api/v1/auth/csrf",
                                                "/api/v1/auth/turnstile/config",
                                                "/api/v1/auth/register",
                                                "/api/v1/auth/login",
                                                "/api/v1/auth/google/config",
                                                "/api/v1/auth/google",
                                                "/api/v1/auth/refresh",
                                                "/api/v1/auth/logout",
                                                "/api/v1/health",
                                                "/error")
                                        .permitAll()
                                        .anyRequest()
                                        .denyAll())
                .exceptionHandling(
                        exceptions ->
                                exceptions
                                        .authenticationEntryPoint(
                                                (request, response, error) ->
                                                        errors.write(
                                                                request,
                                                                response,
                                                                401,
                                                                "AUTHENTICATION_REQUIRED",
                                                                "Authentication is required."))
                                        .accessDeniedHandler(
                                                (request, response, error) ->
                                                        errors.write(
                                                                request,
                                                                response,
                                                                403,
                                                                error instanceof CsrfException
                                                                        ? "CSRF_INVALID"
                                                                        : "FORBIDDEN",
                                                                "Request is not permitted.")))
                .addFilterBefore(new OriginFilter(settings, errors), CorsFilter.class)
                .addFilterBefore(
                        new IdentityAuthenticationFilter(tokens, identity, errors),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private CorsConfigurationSource corsSource(AuthSettings settings) {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(settings.allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-XSRF-TOKEN"));
        config.setAllowCredentials(true);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
