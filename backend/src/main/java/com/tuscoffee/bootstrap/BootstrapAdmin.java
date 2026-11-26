package com.tuscoffee.bootstrap;

import com.tuscoffee.service.IdentityService;
import java.util.Arrays;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
@Profile("bootstrap")
public class BootstrapAdmin implements CommandLineRunner {
    private final IdentityService identity;
    private final Environment environment;
    private final ConfigurableApplicationContext context;

    public BootstrapAdmin(
            IdentityService identity,
            Environment environment,
            ConfigurableApplicationContext context) {
        this.identity = identity;
        this.environment = environment;
        this.context = context;
    }

    @Override
    public void run(String... args) {
        String supplied = System.getenv("BOOTSTRAP_ADMIN_PASSWORD");
        char[] password = null;
        try {
            if (supplied != null) password = supplied.toCharArray();
            else if (System.console() != null)
                password = System.console().readPassword("Admin password: ");
            if (password == null)
                throw new IllegalArgumentException(
                        "Provide BOOTSTRAP_ADMIN_PASSWORD or run in an interactive console.");
            identity.bootstrap(
                    environment.getRequiredProperty("bootstrap.admin.name"),
                    environment.getRequiredProperty("bootstrap.admin.email"),
                    new String(password));
            System.out.println("Administrator created successfully.");
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            context.close();
        }
    }
}
