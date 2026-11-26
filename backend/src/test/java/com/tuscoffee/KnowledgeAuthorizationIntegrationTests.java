package com.tuscoffee;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = {"spring.config.import=", "catalog.seed.enabled=false", "RAG_WORKER_ENABLED=false"})
class KnowledgeAuthorizationIntegrationTests extends MySqlIntegrationSupport {
    private static final String DOCUMENTS = "/api/v1/admin/knowledge/documents";

    @Autowired WebApplicationContext context;

    @Test void onlyAdminCanReadKnowledgeDocuments() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(get(DOCUMENTS)).andExpect(status().isUnauthorized());
        mvc.perform(get(DOCUMENTS).with(user("customer").roles("USER")))
                .andExpect(status().isForbidden());
        mvc.perform(get(DOCUMENTS).with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk());
    }

    @Test void uploadRequiresAdminAndCsrf() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        var file = new MockMultipartFile("file", "menu.txt", "text/plain", new byte[] {'a'});
        mvc.perform(multipart(DOCUMENTS).file(file).param("title", "Menu")
                        .with(user("customer").roles("USER")).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(multipart(DOCUMENTS).file(file).param("title", "Menu")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isForbidden());
    }
}
