package com.tuscoffee.controller;

import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.service.VoucherService;
import com.tuscoffee.service.VoucherService.*;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class VoucherController {
    private final VoucherService vouchers;

    public VoucherController(VoucherService vouchers) { this.vouchers = vouchers; }

    @GetMapping("/promotions")
    public List<Promotion> promotions() { return vouchers.promotions(); }

    @GetMapping("/users/me/promotions")
    public List<Promotion> myPromotions(@AuthenticationPrincipal IdentityPrincipal user) {
        return vouchers.promotions(user.user().id());
    }

    @GetMapping("/users/me/vouchers")
    public List<WalletVoucher> wallet(@AuthenticationPrincipal IdentityPrincipal user) {
        return vouchers.wallet(user.user().id());
    }

    @PostMapping("/users/me/vouchers/quote")
    public Quote quote(@AuthenticationPrincipal IdentityPrincipal user, @RequestBody QuoteInput input) {
        return vouchers.quote(user.user().id(), input);
    }

    @PostMapping("/users/me/vouchers/{id}/claim")
    public void claim(@PathVariable long id, @AuthenticationPrincipal IdentityPrincipal user) {
        vouchers.claim(id, user.user().id());
    }

    @GetMapping("/admin/vouchers")
    public List<Voucher> adminVouchers() { return vouchers.vouchers(); }

    @PostMapping("/admin/vouchers")
    public void create(@RequestBody VoucherInput input) { vouchers.save(null, input); }

    @PutMapping("/admin/vouchers/{id}")
    public void update(@PathVariable long id, @RequestBody VoucherInput input) { vouchers.save(id, input); }

    @GetMapping("/admin/vouchers/{id}/stats")
    public Stats stats(@PathVariable long id) { return vouchers.stats(id); }

    @PostMapping("/admin/vouchers/{id}/grants")
    public Map<String, Integer> grant(@PathVariable long id, @RequestBody GrantInput input,
                                     @AuthenticationPrincipal IdentityPrincipal user) {
        return Map.of("granted", vouchers.grant(id, user.user().id(), input));
    }

    @GetMapping("/admin/voucher-customers")
    public List<Customer> customers(@RequestParam(defaultValue = "") String q) { return vouchers.customers(q); }

    @GetMapping("/admin/voucher-groups")
    public List<Group> groups() { return vouchers.groups(); }

    @GetMapping("/admin/voucher-groups/{id}/members")
    public List<Long> members(@PathVariable long id) { return vouchers.members(id); }

    @PostMapping("/admin/voucher-groups")
    public void createGroup(@RequestBody GroupInput input) { vouchers.saveGroup(null, input); }

    @PutMapping("/admin/voucher-groups/{id}")
    public void updateGroup(@PathVariable long id, @RequestBody GroupInput input) { vouchers.saveGroup(id, input); }
}
