# Phase 5 review contract

All IDs are positive integers. Pages are zero based, size 1–50, ordered newest first (createdAt, id). Errors use the existing ProblemDetail `code` contract.

| Method | URL | Access | Response |
|---|---|---|---|
| GET | `/api/v1/products/{productId}/reviews?page=0&size=10` | Public | `{items: Review[],page,size,totalItems,totalPages,summary:{count,average}}` |
| GET | `/api/v1/products/{productId}/reviews/mine` | Signed in | `{eligible:boolean,review:Review|null}` |
| PUT | `/api/v1/products/{productId}/reviews/mine` | Signed in buyer | Review |
| GET | `/api/v1/admin/reviews?productId=&stars=&visible=&page=0&size=20` | ADMIN | ReviewPage |
| GET | `/api/v1/admin/reviews/{id}` | ADMIN | `{review:Review,events:ModerationEvent[]}` |
| PATCH | `/api/v1/admin/reviews/{id}/visibility` | ADMIN | Review |

`Review = {id,productId,productName,authorName,stars,comment,visible,version,createdAt,updatedAt}`. Public responses include visible reviews only, without user ID or email. Public summary counts and averages exactly that same visible population (average 0 when empty). Admin pages use the same shape and their summary describes their filtered population.

PUT body: `{stars:integer 1..5,comment:string|null (max 2000),version:integer|null}`. First creation requires null/omitted version; edit requires the last version. One review per principal/product; principal identity is never accepted from input. A COMPLETED order containing the product is required. Hidden reviews remain hidden on owner edit. Text is stored as plain text and rendered using interpolation, never HTML.

PATCH body: `{visible:boolean,reason:nonblank string max 500,version:integer}`. Moderation changes visibility only; every change records administrator, reason, timestamp, visibility and resulting version atomically. Repeated requests with stale versions fail. Admin detail events contain `{id,actorName,visible,reason,reviewVersion,createdAt}`. Concurrent updates are serialized using row locks and version checks; unique DB constraint rejects concurrent first creation.

Errors: 400 `REVIEW_INVALID`, 403 `REVIEW_PURCHASE_REQUIRED`, 404 `PRODUCT_NOT_FOUND` / `REVIEW_NOT_FOUND`, 409 `REVIEW_STALE` / `DATA_CONFLICT`. Authentication/CSRF and ADMIN authorization use existing security policy. Public and owner product endpoints require an active product in an active category; moderation remains available for archived products.
