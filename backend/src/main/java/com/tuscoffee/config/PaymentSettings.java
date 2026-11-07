package com.tuscoffee.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("payment")
public record PaymentSettings(BankSettings bank, VnPaySettings vnpay) {
    public record BankSettings(String code, String account, String accountName) {
        public BankSettings {
            if (code == null || code.isBlank()) code = "VCB";
            if (account == null || account.isBlank()) account = "0123456789";
            if (accountName == null || accountName.isBlank()) accountName = "TU COFFEE";
        }
    }

    public record VnPaySettings(String tmnCode, String hashSecret, String payUrl, String returnUrl) {
        public VnPaySettings {
            if (tmnCode == null || tmnCode.isBlank()) tmnCode = "DEMOV210";
            if (hashSecret == null || hashSecret.isBlank()) hashSecret = "DEMOHASHSECRET210";
            if (payUrl == null || payUrl.isBlank()) payUrl = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
            if (returnUrl == null || returnUrl.isBlank()) returnUrl = "http://localhost:4200/orders/vnpay-return";
        }
    }

    public PaymentSettings {
        if (bank == null) bank = new BankSettings("VCB", "0123456789", "TU COFFEE");
        if (vnpay == null) vnpay = new VnPaySettings("DEMOV210", "DEMOHASHSECRET210", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", "http://localhost:4200/orders/vnpay-return");
    }
}
