package com.tuscoffee.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("payment")
public record PaymentSettings(BankSettings bank) {
    public record BankSettings(String code, String account, String accountName) {
        public BankSettings {
            if (code == null || code.isBlank()) code = "VCB";
            if (account == null || account.isBlank()) account = "0123456789";
            if (accountName == null || accountName.isBlank()) accountName = "TU COFFEE";
        }
    }

    public PaymentSettings {
        if (bank == null) bank = new BankSettings("VCB", "0123456789", "TU COFFEE");
    }
}
