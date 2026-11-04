# Contract giai đoạn 3

Base /api/v1; errors application/problem+json (code/detail như auth), quyền backend và CSRF cho ghi. Không DELETE.
Category: {id,name,slug,active,version}. Product: {id,name,description,priceVnd,imageUrl,active,version,category:Category}. Page: {items,page,size,totalItems,totalPages}.
GET /categories public → Category[] active.
GET /products public → Page<Product>, q/categoryId/page(default0)/size(default12,max100)/sort(default id; id,name,priceAsc,priceDesc). q<=100, tìm literal %,_, dấu escape; page<=1000000. Active product AND active category; inactive detail404.
GET /products/{id} public → Product.
GET /admin/categories ADMIN → Category[] (cả inactive).
POST /admin/categories {name,slug} →201 Category.
PUT /admin/categories/{id} {name,slug,version} →Category.
PATCH /admin/categories/{id}/active {active,version} →Category.
GET /admin/products ADMIN →Page<Product>, filters như public + active optional; cả inactive.
POST /admin/products {categoryId,name,description?,priceVnd} →201 Product.
PUT /admin/products/{id} {categoryId,name,description?,priceVnd,version} →Product.
PATCH /admin/products/{id}/active {active,version} →Product.
POST /admin/products/{id}/image?version=N multipart file →Product.
Image URL /api/v1/catalog/images/{uuid}.{ext} để dùng proxy /api hiện có; chỉ tên server tạo và ảnh an toàn. UploadJPEG/PNG/WebP<=5MB, kiểm tra decode/pixel limit, không path/MIMEclient, transactional cleanup nếu DBupdate fail, không xóa ảnh cũ trước commit.
Price integer0..100000000VND; name trim1..200; category name trim1..100; slug lowercase ASCII [a-z0-9]+(?:-[a-z0-9]+)* <=120; description optional<=10000; versionnonnegative required on changes. Unknownfields400. Page/inputinvalid400, notfound404, stale/duplicate409, uploadsize413,type415.
18 món/5 danh mục lấy từ data/imports/coffe-web-20261102, importlocal opt-in, idempotent by source_system/source_id, không tự seed production. Không nhập rating nguồn thành review. API/UI cart/orders/reset/RAG ngoài phạmvi lượt này.
