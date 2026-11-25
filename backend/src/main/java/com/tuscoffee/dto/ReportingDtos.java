package com.tuscoffee.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import com.tuscoffee.dto.OrderDtos.OrderResponse;

public final class ReportingDtos {
    private ReportingDtos() {}

    public record TimelinePoint(
            String periodKey,
            String label,
            LocalDate date,
            long revenueVnd,
            long orderCount
    ) {}

    public record DashboardResponse(
            LocalDate from,
            LocalDate to,
            String timeZone,
            long revenueVnd,
            long completedPaidOrders,
            long totalOrders,
            Map<String, Long> statusCounts,
            List<OrderResponse> recentOrders,
            List<TimelinePoint> timeline
    ) {
        public DashboardResponse(
                LocalDate from,
                LocalDate to,
                String timeZone,
                long revenueVnd,
                long completedPaidOrders,
                long totalOrders,
                Map<String, Long> statusCounts,
                List<OrderResponse> recentOrders) {
            this(from, to, timeZone, revenueVnd, completedPaidOrders, totalOrders, statusCounts, recentOrders, List.of());
        }
    }
}
