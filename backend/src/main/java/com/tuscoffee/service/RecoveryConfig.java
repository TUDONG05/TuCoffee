package com.tuscoffee.service;

import java.time.Clock;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RecoveryConfig {
    @Bean("recoveryClock") Clock recoveryClock() { return Clock.systemUTC(); }
    @Bean(name="recoveryExecutor", destroyMethod="shutdown")
    ThreadPoolExecutor recoveryExecutor() {
        return new ThreadPoolExecutor(1, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32),
            runnable -> { Thread t = new Thread(runnable, "password-recovery-mail"); t.setDaemon(true); return t; },
            new ThreadPoolExecutor.AbortPolicy());
    }
}
