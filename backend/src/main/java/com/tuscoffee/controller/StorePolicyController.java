package com.tuscoffee.controller;

import com.tuscoffee.exception.ApiException;
import com.tuscoffee.service.CatalogImageStorage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class StorePolicyController {
    private static final String SELECT = "SELECT id, slug, title, content, published, version, updated_at, image_path FROM store_policies";
    private static final RowMapper<Policy> POLICY = (rs, row) -> new Policy(
            rs.getLong("id"), rs.getString("slug"), rs.getString("title"), rs.getString("content"),
            rs.getBoolean("published"), rs.getLong("version"), rs.getTimestamp("updated_at").toInstant(),
            imageUrl(rs.getString("image_path")));

    private final JdbcTemplate jdbc;
    private final CatalogImageStorage images;

    public StorePolicyController(JdbcTemplate jdbc, CatalogImageStorage images) {
        this.jdbc = jdbc;
        this.images = images;
    }

    @GetMapping("/policies")
    public List<Summary> policies() {
        return jdbc.query("SELECT slug, title, image_path FROM store_policies WHERE published = TRUE ORDER BY title, id",
                (rs, row) -> new Summary(rs.getString("slug"), rs.getString("title"), imageUrl(rs.getString("image_path"))));
    }

    @GetMapping("/policies/{slug}")
    public PublicPolicy policy(@PathVariable String slug) {
        return jdbc.query(SELECT + " WHERE slug = ? AND published = TRUE", POLICY, slug)
                .stream().findFirst()
                .map(policy -> new PublicPolicy(policy.slug(), policy.title(), policy.content(), policy.updatedAt(), policy.imageUrl()))
                .orElseThrow(() -> new ApiException(404, "POLICY_NOT_FOUND", "Không tìm thấy chính sách."));
    }

    @GetMapping("/admin/policies")
    public List<Policy> adminPolicies() {
        return jdbc.query(SELECT + " ORDER BY updated_at DESC, id DESC", POLICY);
    }

    @PostMapping("/admin/policies")
    public void create(@Valid @RequestBody PolicyInput input) {
        try {
            jdbc.update("INSERT INTO store_policies (slug, title, content) VALUES (?, ?, ?)",
                    input.slug(), input.title().strip(), input.content().strip());
        } catch (DuplicateKeyException ex) {
            throw duplicateSlug();
        }
    }

    @PutMapping("/admin/policies/{id}")
    public void update(@PathVariable long id, @Valid @RequestBody PolicyUpdate update) {
        try {
            var input = update.policy();
            int count = jdbc.update("""
                    UPDATE store_policies SET slug = ?, title = ?, content = ?, published = ?,
                        version = version + 1, updated_at = CURRENT_TIMESTAMP(6)
                    WHERE id = ? AND version = ?
                    """, input.slug(), input.title().strip(), input.content().strip(), update.published(), id, update.version());
            if (count == 0) {
                throw new ApiException(409, "POLICY_STALE", "Chính sách đã thay đổi. Hãy tải lại danh sách.");
            }
        } catch (DuplicateKeyException ex) {
            throw duplicateSlug();
        }
    }

    private static ApiException duplicateSlug() {
        return new ApiException(409, "POLICY_SLUG_EXISTS", "Đường dẫn này đã được sử dụng.");
    }

    @PutMapping(value = "/admin/policies/{id}/image", consumes = "multipart/form-data")
    public void uploadImage(@PathVariable long id, @RequestParam long version, @RequestParam MultipartFile file) {
        var paths = jdbc.query("SELECT image_path FROM store_policies WHERE id = ? AND version = ?",
                (rs, row) -> rs.getString(1), id, version);
        if (paths.isEmpty()) throw stalePolicy();
        String filename = images.save(file);
        boolean linked = false;
        try {
            linked = jdbc.update("""
                    UPDATE store_policies SET image_path = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP(6)
                    WHERE id = ? AND version = ?
                    """, filename, id, version) == 1;
            if (!linked) throw stalePolicy();
        } finally {
            if (!linked) images.delete(filename);
        }
        if (paths.getFirst() != null) images.delete(paths.getFirst());
    }

    private static ApiException stalePolicy() {
        return new ApiException(409, "POLICY_STALE", "Chính sách đã thay đổi. Hãy tải lại danh sách.");
    }

    private static String imageUrl(String filename) {
        return filename == null ? null : "/api/v1/catalog/images/" + filename;
    }

    public record Summary(String slug, String title, String imageUrl) {}
    public record PublicPolicy(String slug, String title, String content, Instant updatedAt, String imageUrl) {}
    public record Policy(long id, String slug, String title, String content, boolean published, long version, Instant updatedAt,
                         String imageUrl) {}
    public record PolicyInput(
            @NotBlank @Size(max = 100) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
            @NotBlank @Size(max = 160) String title,
            @NotBlank @Size(max = 12000) String content) {}
    public record PolicyUpdate(@Valid @jakarta.validation.constraints.NotNull PolicyInput policy, boolean published, long version) {}
}
