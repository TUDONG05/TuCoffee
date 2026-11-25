package com.tuscoffee.service;

import com.tuscoffee.dto.ReportingDtos.DashboardResponse;
import com.tuscoffee.dto.ReportingDtos.TimelinePoint;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.OrderRepository;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportingService {
    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("dd/MM");
    private final OrderRepository orders;
    private final OrderService orderService;

    public ReportingService(OrderRepository orders, OrderService orderService) {
        this.orders = orders;
        this.orderService = orderService;
    }

    @Transactional(readOnly = true)
    public DashboardResponse dashboard(LocalDate from, LocalDate to) {
        if (from == null || to == null || from.isAfter(to) || to.equals(LocalDate.MAX)) {
            throw new ApiException(400, "INVALID_DATE_RANGE", "A valid inclusive from/to date range is required.");
        }
        Instant start = from.atStartOfDay(ZONE).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(ZONE).toInstant();
        var counts = new LinkedHashMap<String, Long>();
        for (String status : new String[]{"PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"}) counts.put(status, 0L);
        for (var row : orders.countStatuses(start, end)) counts.put(row.getStatus(), row.getTotal());
        var revenue = orders.completedRevenue(start, end);

        List<OrderRepository.CompletedOrderSummary> completedList = orders.findCompletedOrders(start, end);
        Map<LocalDate, List<OrderRepository.CompletedOrderSummary>> byDate = completedList.stream()
                .filter(o -> o.getCompletedAt() != null)
                .collect(Collectors.groupingBy(o -> o.getCompletedAt().atZone(ZONE).toLocalDate()));

        List<TimelinePoint> timeline = new ArrayList<>();
        LocalDate curr = from;
        while (!curr.isAfter(to)) {
            List<OrderRepository.CompletedOrderSummary> dayOrders = byDate.getOrDefault(curr, List.of());
            long dayRevenue = dayOrders.stream().mapToLong(OrderRepository.CompletedOrderSummary::getTotalVnd).sum();
            long dayCount = dayOrders.size();
            timeline.add(new TimelinePoint(
                    curr.toString(),
                    curr.format(DAY_FMT),
                    curr,
                    dayRevenue,
                    dayCount
            ));
            curr = curr.plusDays(1);
        }

        return new DashboardResponse(
                from,
                to,
                ZONE.getId(),
                revenue.getRevenueVnd(),
                revenue.getCompletedPaidOrders(),
                counts.values().stream().mapToLong(Long::longValue).sum(),
                counts,
                orderService.recentOrders(start, end),
                timeline
        );
    }
}
