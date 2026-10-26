package com.tuscoffee.identity;

import com.tuscoffee.shared.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.stereotype.Component;
import jakarta.validation.Validator;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Component
public class IdentityValidation {
    private final Validator validator;
    public IdentityValidation(Validator validator) { this.validator = validator; }
    private record EmailValue(@NotBlank @Email String email) { }
    public String email(String value) {
        String email = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 150 || !validator.validate(new EmailValue(email)).isEmpty()) {
            throw bad("Email không hợp lệ.");
        }
        return email;
    }
    public String name(String value) {
        String name = value == null ? "" : value.trim();
        if (name.length() < 2 || name.length() > 100) throw bad("Tên phải có 2 đến 100 ký tự.");
        return name;
    }
    public void password(String password) {
        if (password == null || password.codePointCount(0, password.length()) < 10
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw bad("Mật khẩu phải có ít nhất 10 ký tự và tối đa 72 byte UTF-8.");
        }
    }
    public void credentialsPassword(String password) {
        if (password == null || password.isEmpty()
                || password.getBytes(StandardCharsets.UTF_8).length > 72) throw bad("Mật khẩu không hợp lệ.");
    }
    public String phone(String phone) {
        String value = optional(phone);
        if (value != null && !value.matches("^0[35789]\\d{8}$")) throw bad("Số điện thoại không hợp lệ.");
        return value;
    }
    public String address(String address) {
        String value = optional(address);
        if (value != null && value.length() > 300) throw bad("Địa chỉ tối đa 300 ký tự.");
        return value;
    }
    private String optional(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public static ApiException bad(String message) { return new ApiException(400, "VALIDATION_ERROR", message); }
}
