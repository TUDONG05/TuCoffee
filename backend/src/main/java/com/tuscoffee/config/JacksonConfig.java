package com.tuscoffee.config;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

@Configuration
public class JacksonConfig {
    @Bean
    JsonMapperBuilderCustomizer strictJsonScalarTypes() {
        // Jackson's general scalar flag does not prevent number/boolean-to-String
        // coercion.
        return builder ->
                builder.withCoercionConfig(
                                LogicalType.Textual,
                                config ->
                                        config.setCoercion(
                                                        CoercionInputShape.Integer,
                                                        CoercionAction.Fail)
                                                .setCoercion(
                                                        CoercionInputShape.Float,
                                                        CoercionAction.Fail)
                                                .setCoercion(
                                                        CoercionInputShape.Boolean,
                                                        CoercionAction.Fail))
                        .withCoercionConfig(
                                LogicalType.Boolean,
                                config ->
                                        config.setCoercion(
                                                        CoercionInputShape.String,
                                                        CoercionAction.Fail)
                                                .setCoercion(
                                                        CoercionInputShape.Integer,
                                                        CoercionAction.Fail)
                                                .setCoercion(
                                                        CoercionInputShape.Float,
                                                        CoercionAction.Fail));
    }
}
