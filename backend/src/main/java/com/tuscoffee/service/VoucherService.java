package com.tuscoffee.service;

import com.tuscoffee.dto.OrderDtos.CreateOrderItemRequest;
import com.tuscoffee.exception.ApiException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VoucherService {
    private static final RowMapper<Voucher> VOUCHER = (rs, row) -> new Voucher(
            rs.getLong("id"), rs.getString("code"), rs.getString("title"), rs.getString("description"),
            rs.getString("kind"), rs.getLong("amount"), rs.getLong("min_subtotal"),
            rs.getObject("max_discount", Long.class), rs.getTimestamp("starts_at").toInstant(),
            rs.getTimestamp("ends_at").toInstant(), rs.getInt("total_limit"), rs.getInt("per_user_limit"),
            rs.getBoolean("enabled"), rs.getBoolean("advertised"), rs.getBoolean("self_claim"), rs.getLong("version"));
    private final JdbcTemplate jdbc;

    public VoucherService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Promotion> promotions() {
        return promotions(null);
    }

    public List<Promotion> promotions(Long userId) {
        return jdbc.query("""
                SELECT id,title,description,kind,amount,min_subtotal,max_discount,ends_at,self_claim FROM vouchers v
                WHERE enabled AND advertised AND starts_at <= CURRENT_TIMESTAMP(6) AND ends_at > CURRENT_TIMESTAMP(6)
                  AND (self_claim OR EXISTS (
                    SELECT 1 FROM voucher_grants g WHERE g.voucher_id=v.id AND g.user_id=?
                  ))
                  AND total_limit > (
                    SELECT COUNT(*) FROM voucher_redemptions r JOIN orders o ON o.id=r.order_id
                    WHERE r.voucher_id=v.id AND o.status<>'CANCELLED'
                  )
                  AND per_user_limit > (
                    SELECT COUNT(*) FROM voucher_redemptions r JOIN orders o ON o.id=r.order_id
                    WHERE r.voucher_id=v.id AND r.user_id=? AND o.status<>'CANCELLED'
                  )
                ORDER BY ends_at,id
                """, (rs, row) -> new Promotion(rs.getLong("id"), rs.getString("title"), rs.getString("description"),
                rs.getString("kind"), rs.getLong("amount"), rs.getLong("min_subtotal"),
                rs.getObject("max_discount", Long.class), rs.getTimestamp("ends_at").toInstant(), rs.getBoolean("self_claim")),
                userId, userId);
    }

    public List<Voucher> vouchers() { return jdbc.query("SELECT * FROM vouchers ORDER BY id DESC", VOUCHER); }

    public List<WalletVoucher> wallet(long userId) {
        return jdbc.query("""
                SELECT v.*,
                  (SELECT COUNT(*) FROM voucher_redemptions r JOIN orders o ON o.id=r.order_id
                    WHERE r.voucher_id=v.id AND o.status<>'CANCELLED') AS total_used,
                  (SELECT COUNT(*) FROM voucher_redemptions r JOIN orders o ON o.id=r.order_id
                    WHERE r.voucher_id=v.id AND r.user_id=g.user_id AND o.status<>'CANCELLED') AS user_used
                FROM vouchers v JOIN voucher_grants g ON g.voucher_id=v.id
                WHERE g.user_id=? ORDER BY v.ends_at DESC,v.id DESC
                """, (rs, row) -> {
            Voucher v = VOUCHER.mapRow(rs, row);
            long remaining = Math.max(0, Math.min(v.totalLimit() - rs.getLong("total_used"),
                    v.perUserLimit() - rs.getLong("user_used")));
            return new WalletVoucher(v.id(), v.code(), v.title(), v.description(), v.kind(), v.amount(),
                    v.minSubtotal(), v.maxDiscount(), v.startsAt(), v.endsAt(), v.enabled(), remaining);
        }, userId);
    }

    @Transactional
    public void save(Long id, VoucherInput input) {
        validate(input);
        try {
            if (id == null) {
                jdbc.update("""
                        INSERT INTO vouchers(code,title,description,kind,amount,min_subtotal,max_discount,starts_at,
                          ends_at,total_limit,per_user_limit,enabled,advertised,self_claim) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """, input.code(), input.title().strip(), input.description().strip(), input.kind(), input.amount(),
                        input.minSubtotal(), input.maxDiscount(), Timestamp.from(input.startsAt()), Timestamp.from(input.endsAt()),
                        input.totalLimit(), input.perUserLimit(), input.enabled(), input.advertised(), input.selfClaim());
            } else {
                Voucher current = find(id, true);
                if (current.version() != input.version()) {
                    throw conflict("VOUCHER_STALE", "Voucher đã thay đổi. Hãy tải lại danh sách.");
                }
                boolean hasOrders = !jdbc.queryForList("""
                        SELECT order_id FROM voucher_redemptions WHERE voucher_id=? LIMIT 1 FOR UPDATE
                        """, Long.class, id).isEmpty();
                if (hasOrders) {
                    jdbc.update("""
                        UPDATE vouchers SET title=?, description=?, enabled=?, advertised=?, self_claim=?, version=version+1
                        WHERE id=?
                        """, input.title().strip(), input.description().strip(), input.enabled(), input.advertised(), input.selfClaim(), id);
                } else {
                    jdbc.update("""
                        UPDATE vouchers SET code=?,title=?,description=?,kind=?,amount=?,min_subtotal=?,
                          max_discount=?,starts_at=?,ends_at=?,total_limit=?,per_user_limit=?,enabled=?,
                          advertised=?,self_claim=?,version=version+1 WHERE id=?
                        """, input.code(), input.title().strip(), input.description().strip(), input.kind(), input.amount(),
                        input.minSubtotal(), input.maxDiscount(), Timestamp.from(input.startsAt()), Timestamp.from(input.endsAt()),
                        input.totalLimit(), input.perUserLimit(), input.enabled(), input.advertised(), input.selfClaim(), id);
                }
            }
        } catch (DuplicateKeyException ex) {
            throw conflict("VOUCHER_CODE_EXISTS", "Mã voucher đã tồn tại.");
        }
    }

    public List<Group> groups() {
        return jdbc.query("SELECT id,name FROM voucher_groups ORDER BY name,id",
                (rs, row) -> new Group(rs.getLong(1), rs.getString(2)));
    }

    @Transactional
    public void claim(long id, long userId) {
        Voucher v = find(id, true);
        Instant now = Instant.now();
        if (!v.selfClaim() || !v.advertised() || !v.enabled() || now.isBefore(v.startsAt()) || !now.isBefore(v.endsAt())) {
            throw conflict("VOUCHER_CLAIM_UNAVAILABLE", "Ưu đãi hiện không nhận được.");
        }
        if (!jdbc.queryForList("SELECT user_id FROM voucher_grants WHERE voucher_id=? AND user_id=?",
                Long.class, id, userId).isEmpty()) return;
        int claimed = jdbc.update("""
                INSERT INTO voucher_grants(voucher_id,user_id,issued_by)
                SELECT ?,id,id FROM users WHERE id=? AND active AND role='USER'
                """, id, userId);
        if (claimed == 0) throw new ApiException(403, "VOUCHER_CLAIM_FORBIDDEN", "Voucher chỉ dành cho tài khoản khách hàng.");
    }

    public List<Customer> customers(String query) {
        String search = query == null ? "" : query.strip().substring(0, Math.min(150, query.strip().length()));
        return jdbc.query("""
                SELECT id,name,email FROM users WHERE active AND role='USER'
                AND (LOCATE(?,email)>0 OR LOCATE(?,name)>0) ORDER BY id LIMIT 50
                """, (rs, row) -> new Customer(rs.getLong(1), rs.getString(2), rs.getString(3)), search, search);
    }

    public List<Long> members(long groupId) {
        return jdbc.queryForList("SELECT user_id FROM voucher_group_members WHERE group_id=? ORDER BY user_id",
                Long.class, groupId);
    }

    @Transactional
    public void saveGroup(Long id, GroupInput input) {
        if (input == null || input.name() == null || input.name().isBlank() || input.name().length() > 100
                || input.userIds() == null || input.userIds().size() > 1000
                || input.userIds().stream().anyMatch(value -> value == null || value <= 0)) {
            throw invalid("Thông tin nhóm khách không hợp lệ.");
        }
        Long groupId;
        try {
            if (id == null) {
                jdbc.update("INSERT INTO voucher_groups(name) VALUES(?)", input.name().strip());
                groupId = jdbc.queryForObject("SELECT id FROM voucher_groups WHERE name=?", Long.class, input.name().strip());
            } else {
                if (jdbc.queryForList("SELECT id FROM voucher_groups WHERE id=? FOR UPDATE", Long.class, id).isEmpty()) {
                    throw invalid("Không tìm thấy nhóm.");
                }
                jdbc.update("UPDATE voucher_groups SET name=? WHERE id=?", input.name().strip(), id);
                groupId = id;
            }
        } catch (DuplicateKeyException ex) {
            throw conflict("GROUP_NAME_EXISTS", "Tên nhóm đã được sử dụng.");
        }
        jdbc.update("DELETE FROM voucher_group_members WHERE group_id=?", groupId);
        for (Long userId : new HashSet<>(input.userIds())) {
            if (jdbc.update("""
                    INSERT INTO voucher_group_members(group_id,user_id)
                    SELECT ?, id FROM users WHERE id=? AND active AND role='USER'
                    """, groupId, userId) != 1) throw invalid("Có khách hàng không hợp lệ trong nhóm.");
        }
    }

    @Transactional
    public int grant(long voucherId, long actorId, GrantInput input) {
        Voucher v = find(voucherId, true);
        if (!v.enabled() || !v.endsAt().isAfter(Instant.now())) throw invalid("Voucher đã tắt hoặc hết hạn.");
        if (input == null || input.target() == null) throw invalid("Hãy chọn đối tượng nhận voucher.");
        Long target = input.targetId();
        String filter = switch (input.target()) {
            case "ALL" -> "";
            case "GROUP" -> {
                if (target == null || jdbc.queryForList("SELECT id FROM voucher_groups WHERE id=? FOR UPDATE",
                        Long.class, target).isEmpty()) throw invalid("Không tìm thấy nhóm.");
                yield " AND EXISTS (SELECT 1 FROM voucher_group_members m WHERE m.group_id=? AND m.user_id=u.id)";
            }
            case "USER" -> {
                if (target == null || jdbc.queryForList("SELECT id FROM users WHERE id=? AND role='USER' AND active",
                        Long.class, target).isEmpty()) throw invalid("Không tìm thấy khách hàng đang hoạt động.");
                yield " AND u.id=?";
            }
            default -> throw invalid("Đối tượng nhận voucher không hợp lệ.");
        };
        String sql = """
                INSERT INTO voucher_grants(voucher_id,user_id,issued_by)
                SELECT ?,u.id,? FROM users u WHERE u.active AND u.role='USER'
                  AND NOT EXISTS (SELECT 1 FROM voucher_grants g WHERE g.voucher_id=? AND g.user_id=u.id)
                """ + filter;
        return filter.isEmpty() ? jdbc.update(sql, voucherId, actorId, voucherId)
                : jdbc.update(sql, voucherId, actorId, voucherId, target);
    }

    public Stats stats(long id) {
        long granted = jdbc.queryForObject("SELECT COUNT(*) FROM voucher_grants WHERE voucher_id=?", Long.class, id);
        List<Usage> usage = jdbc.query("""
                SELECT r.order_id,o.public_code,o.status,p.status AS payment_status,r.discount_vnd
                FROM voucher_redemptions r JOIN orders o ON o.id=r.order_id JOIN payments p ON p.order_id=o.id
                WHERE r.voucher_id=? ORDER BY r.order_id DESC LIMIT 100
                """, (rs, row) -> new Usage(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getLong(5)), id);
        return new Stats(granted, usage);
    }

    @Transactional(readOnly = true)
    public Quote quote(long userId, QuoteInput input) {
        if (input == null || input.voucherId() == null || input.items() == null
                || input.items().isEmpty() || input.items().size() > 50) throw invalid("Giỏ hàng không hợp lệ.");
        long subtotal = 0;
        var products = new HashSet<Long>();
        for (var item : input.items()) {
            if (item == null || item.productId() == null || item.quantity() == null || item.quantity() < 1
                    || item.quantity() > 99 || !products.add(item.productId())) throw invalid("Món hoặc số lượng không hợp lệ.");
            long price = jdbc.queryForList("""
                    SELECT p.price_vnd FROM products p JOIN categories c ON c.id=p.category_id
                    WHERE p.id=? AND p.is_active AND c.is_active
                    """, Long.class, item.productId()).stream().findFirst()
                    .orElseThrow(() -> conflict("PRODUCT_UNAVAILABLE", "Có món không còn bán."));
            if (item.expectedPriceVnd() == null || item.expectedPriceVnd() != price) {
                throw conflict("PRICE_CHANGED", "Giá món đã thay đổi. Hãy kiểm tra lại giỏ hàng.");
            }
            subtotal += price * item.quantity();
        }
        if (subtotal > 100_000_000) throw invalid("Tổng giá trị giỏ hàng vượt giới hạn.");
        return evaluate(userId, input.voucherId(), subtotal, false);
    }

    public Quote reserve(long userId, long voucherId, long subtotal) {
        return evaluate(userId, voucherId, subtotal, true);
    }

    public void record(long orderId, long userId, Quote quote) {
        jdbc.update("""
                INSERT INTO voucher_redemptions(order_id,voucher_id,user_id,voucher_code,subtotal_vnd,discount_vnd)
                VALUES(?,?,?,?,?,?)
                """, orderId, quote.voucherId(), userId, quote.code(), quote.subtotalVnd(), quote.discountVnd());
    }

    private Quote evaluate(long userId, long id, long subtotal, boolean lock) {
        Voucher v = find(id, lock);
        Instant now = Instant.now();
        if (!v.enabled() || now.isBefore(v.startsAt()) || !now.isBefore(v.endsAt())) {
            throw conflict("VOUCHER_INACTIVE", "Voucher chưa đến hạn, đã hết hạn hoặc đã tắt.");
        }
        if (jdbc.queryForList("SELECT user_id FROM voucher_grants WHERE voucher_id=? AND user_id=?"
                + (lock ? " FOR UPDATE" : ""), Long.class, id, userId).isEmpty()) {
            throw new ApiException(403, "VOUCHER_NOT_ASSIGNED", "Voucher chưa được cấp cho tài khoản này.");
        }
        if (subtotal < v.minSubtotal()) throw conflict("VOUCHER_MIN_SUBTOTAL", "Giỏ hàng chưa đạt giá trị tối thiểu.");
        List<Long> used = jdbc.queryForList("""
                SELECT r.user_id FROM voucher_redemptions r JOIN orders o ON o.id=r.order_id
                WHERE r.voucher_id=? AND o.status<>'CANCELLED'
                """ + (lock ? " FOR UPDATE" : ""), Long.class, id);
        if (used.size() >= v.totalLimit() || used.stream().filter(u -> u == userId).count() >= v.perUserLimit()) {
            throw conflict("VOUCHER_LIMIT_REACHED", "Voucher đã hết lượt áp dụng.");
        }
        long discount = "PERCENT".equals(v.kind()) ? subtotal * v.amount() / 100 : v.amount();
        if (v.maxDiscount() != null) discount = Math.min(discount, v.maxDiscount());
        discount = Math.min(discount, subtotal - 1);
        if (discount < 1) throw conflict("VOUCHER_NO_DISCOUNT", "Voucher không tạo được mức giảm cho giỏ hàng này.");
        return new Quote(id, v.code(), subtotal, discount, subtotal - discount);
    }

    private Voucher find(long id, boolean lock) {
        return jdbc.query("SELECT * FROM vouchers WHERE id=?" + (lock ? " FOR UPDATE" : ""), VOUCHER, id)
                .stream().findFirst().orElseThrow(() -> new ApiException(404, "VOUCHER_NOT_FOUND", "Không tìm thấy voucher."));
    }

    private static void validate(VoucherInput v) {
        if (v == null || v.code() == null || !v.code().matches("[A-Z0-9_-]{2,40}")
                || v.title() == null || v.title().isBlank() || v.title().length() > 160
                || v.description() == null || v.description().length() > 4000
                || !("PERCENT".equals(v.kind()) || "FIXED".equals(v.kind()))
                || v.amount() < 1 || v.amount() > ("PERCENT".equals(v.kind()) ? 100 : 100_000_000)
                || v.minSubtotal() < 0 || v.minSubtotal() > 100_000_000
                || (v.maxDiscount() != null && (v.maxDiscount() < 1 || v.maxDiscount() > 100_000_000))
                || v.startsAt() == null || v.endsAt() == null || !v.endsAt().isAfter(v.startsAt())
                || v.totalLimit() < 1 || v.perUserLimit() < 1 || v.perUserLimit() > v.totalLimit()) {
            throw invalid("Thông tin voucher không hợp lệ.");
        }
    }

    private static ApiException invalid(String message) { return new ApiException(400, "VOUCHER_INVALID", message); }
    private static ApiException conflict(String code, String message) { return new ApiException(409, code, message); }

    public record Voucher(long id, String code, String title, String description, String kind, long amount,
                          long minSubtotal, Long maxDiscount, Instant startsAt, Instant endsAt, int totalLimit,
                          int perUserLimit, boolean enabled, boolean advertised, boolean selfClaim, long version) {}
    public record VoucherInput(String code, String title, String description, String kind, long amount,
                               long minSubtotal, Long maxDiscount, Instant startsAt, Instant endsAt, int totalLimit,
                               int perUserLimit, boolean enabled, boolean advertised, boolean selfClaim, long version) {}
    public record Promotion(long id, String title, String description, String kind, long amount,
                            long minSubtotal, Long maxDiscount, Instant endsAt, boolean selfClaim) {}
    public record WalletVoucher(long id, String code, String title, String description, String kind, long amount,
                                long minSubtotal, Long maxDiscount, Instant startsAt, Instant endsAt, boolean enabled,
                                long remaining) {}
    public record Group(long id, String name) {}
    public record Customer(long id, String name, String email) {}
    public record GroupInput(String name, List<Long> userIds) {}
    public record GrantInput(String target, Long targetId) {}
    public record QuoteInput(Long voucherId, List<CreateOrderItemRequest> items) {}
    public record Quote(long voucherId, String code, long subtotalVnd, long discountVnd, long totalVnd) {}
    public record Usage(long orderId, String publicCode, String status, String paymentStatus, long discountVnd) {}
    public record Stats(long granted, List<Usage> usage) {}
}
