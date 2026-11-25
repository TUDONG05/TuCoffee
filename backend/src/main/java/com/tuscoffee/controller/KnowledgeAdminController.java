package com.tuscoffee.controller;

import com.tuscoffee.dto.KnowledgeDtos.Document;
import com.tuscoffee.dto.KnowledgeDtos.Enabled;
import com.tuscoffee.dto.KnowledgeDtos.Page;
import com.tuscoffee.dto.KnowledgeDtos.Queued;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.KnowledgeAdminService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/admin/knowledge/documents")
public class KnowledgeAdminController {
    private final KnowledgeAdminService service;

    public KnowledgeAdminController(KnowledgeAdminService service) {
        this.service = service;
    }

    @GetMapping
    public Page list(@RequestParam(defaultValue = "") String q,
                     @RequestParam(defaultValue = "0") int page,
                     @RequestParam(defaultValue = "20") int size,
                     @RequestParam(required = false) Boolean enabled,
                     @RequestParam(defaultValue = "") String format) {
        return service.list(q, page, size, enabled, format);
    }

    @GetMapping("/{id}")
    public Document detail(@PathVariable long id) {
        return service.detail(id);
    }

    @GetMapping("/{id}/preview")
    public com.tuscoffee.dto.KnowledgeDtos.Preview preview(@PathVariable long id) {
        return service.preview(id);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Queued upload(@RequestPart MultipartFile file,
                         @AuthenticationPrincipal IdentityPrincipal principal) {
        return service.upload(file, principal.user().id());
    }

    @PostMapping(value = "/{id}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Queued replace(@PathVariable long id, @RequestParam long version,
                          @RequestPart MultipartFile file, @AuthenticationPrincipal IdentityPrincipal principal) {
        return service.replace(id, version, file, principal.user().id());
    }

    @PostMapping("/{id}/reindex")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Queued reindex(@PathVariable long id, @RequestParam long version,
                          @AuthenticationPrincipal IdentityPrincipal principal) {
        return service.reindex(id, version, principal.user().id());
    }

    @PostMapping("/{id}/versions/{versionId}/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Queued retry(@PathVariable long id, @PathVariable long versionId, @RequestParam long version,
                        @AuthenticationPrincipal IdentityPrincipal principal) {
        return service.retry(id, versionId, version, principal.user().id());
    }

    @PatchMapping("/{id}/enabled")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setEnabled(@PathVariable long id, @RequestBody Enabled input,
                           @AuthenticationPrincipal IdentityPrincipal principal) {
        service.setEnabled(id, input, principal.user().id());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id, @RequestParam long version,
                       @AuthenticationPrincipal IdentityPrincipal principal) {
        service.delete(id, version, principal.user().id());
    }
}
