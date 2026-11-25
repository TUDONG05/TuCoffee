package com.tuscoffee.controller;

import com.tuscoffee.dto.ReportingDtos.DashboardResponse;
import com.tuscoffee.service.ReportingService;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/dashboard")
public class ReportingAdminController {
    private final ReportingService reporting;
    public ReportingAdminController(ReportingService reporting) { this.reporting = reporting; }
    @GetMapping
    public DashboardResponse dashboard(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reporting.dashboard(from, to);
    }
}
