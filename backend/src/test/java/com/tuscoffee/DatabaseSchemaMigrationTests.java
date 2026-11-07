package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;

/** Each case owns a schema; never shares auth fixtures or the application database. */
class DatabaseSchemaMigrationTests {
 private String schema;
 private String server;
 private String user;
 private String password;
 private Connection connection;
 @BeforeEach void createIsolatedSchema() throws Exception {
  schema="tu_coffee_test_schema_"+UUID.randomUUID().toString().replace("-","");
  server="jdbc:mysql://"+System.getenv().getOrDefault("TEST_MYSQL_HOST","127.0.0.1")+":"+System.getenv().getOrDefault("TEST_MYSQL_PORT","3306")+"/";
  user=required("TEST_MYSQL_USER");password=required("TEST_MYSQL_PASSWORD");
  try(var c=DriverManager.getConnection(server,user,password);var s=c.createStatement()) {
   s.execute("CREATE DATABASE "+schema+" CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
  }
  connection=DriverManager.getConnection(server+schema+"?connectionTimeZone=UTC",user,password);
 }
 @AfterEach void cleanup() throws Exception {
  if(connection!=null)connection.close();
  if(schema!=null && server!=null && user!=null && password!=null) {
   try(var c=DriverManager.getConnection(server,user,password);var s=c.createStatement()) {s.execute("DROP DATABASE "+schema);}
  }
 }
 private static String required(String key){String v=System.getenv(key);if(v==null||v.isBlank())throw new IllegalStateException("Set "+key+" for a dedicated native MySQL test server.");return v;}
 private Flyway flyway(String target){return Flyway.configure().dataSource(server+schema,user,password).locations("classpath:db/migration").target(target).cleanDisabled(true).load();}
 private void sql(String query) throws SQLException {try(var s=connection.createStatement()){s.execute(query);}}
 private long number(String query) throws SQLException {try(var s=connection.createStatement();var r=s.executeQuery(query)){r.next();return r.getLong(1);}}
 private void reject(String query){assertThrows(SQLException.class,()->sql(query),query);}
 private void users() throws SQLException {
  sql("INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(1,'Admin','admin@example.test','hash','ADMIN',1,CURRENT_TIMESTAMP(6)),(2,'Buyer','buyer@example.test','hash','USER',1,CURRENT_TIMESTAMP(6))");
 }
 private void catalog() throws SQLException {
  sql("INSERT INTO categories(id,name,slug) VALUES(1,'Coffee','coffee')");
  sql("INSERT INTO products(id,category_id,name,price_vnd) VALUES(1,1,'Original coffee',50000)");
 }
 private void order(int id,String source,int creator,String buyer,String operator) throws SQLException {
  sql("INSERT INTO orders(id,public_code,buyer_id,operator_id,created_by,source,total_vnd,customer_name) VALUES("+id+",'ORDER-"+id+"',"+buyer+","+operator+","+creator+",'"+source+"',50000,'Guest')");
 }
 @Test void freshMigrationsAreRepeatableAndComplete() throws Exception {
  var f=flyway("latest");assertEquals(8,f.migrate().migrationsExecuted);f.validate();assertEquals(0,f.migrate().migrationsExecuted);
  assertEquals(22,number("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"));
  assertEquals(16,number("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('categories','products','orders','order_items','order_requests','payments','order_events','product_reviews','review_moderation_events','password_reset_challenges','password_reset_limits','knowledge_documents','knowledge_versions','knowledge_chunks','knowledge_ingestion_jobs','knowledge_audit')"));
 }
 @Test void upgradeFromV3PreservesAccountsSessionsAndMigrationChecksums() throws Exception {
  flyway("3").migrate();users();
  sql("INSERT INTO auth_sessions(id,user_id,refresh_hash,expires_at,created_at) VALUES('00000000-0000-0000-0000-000000000001',2,REPEAT('a',64),CURRENT_TIMESTAMP(6)+INTERVAL 1 DAY,CURRENT_TIMESTAMP(6))");
  long checksum=number("SELECT SUM(checksum) FROM flyway_schema_history WHERE version IN ('1','2','3')");
  var f=flyway("latest");assertEquals(5,f.migrate().migrationsExecuted);f.validate();
  assertEquals(2,number("SELECT COUNT(*) FROM users"));assertEquals(1,number("SELECT COUNT(*) FROM auth_sessions"));
  assertEquals(checksum,number("SELECT SUM(checksum) FROM flyway_schema_history WHERE version IN ('1','2','3')"));
  assertEquals(0,f.migrate().migrationsExecuted);
 }
 @Test void catalogOrdersPaymentsAndReviewsEnforceTheirConstraints() throws Exception {
  flyway("latest").migrate();users();catalog();
  reject("INSERT INTO categories(name,slug) VALUES('duplicate','coffee')");
  reject("INSERT INTO products(category_id,name,price_vnd) VALUES(99,'Invalid category',1)");
  reject("INSERT INTO products(category_id,name,price_vnd) VALUES(1,'Negative',-1)");
  reject("INSERT INTO products(category_id,name,price_vnd,source_system) VALUES(1,'Partial source',1,'legacy')");
  reject("DELETE FROM categories WHERE id=1");
  order(1,"ONLINE",2,"2","NULL");order(2,"POS",1,"NULL","1");
  reject("INSERT INTO orders(public_code,created_by,source,total_vnd,customer_name) VALUES('bad-pos',1,'POS',1,'Guest')");
  sql("INSERT INTO order_items(order_id,product_id,product_name,unit_price_vnd,quantity) VALUES(1,1,'Original coffee',50000,1)");
  assertEquals(50000,number("SELECT subtotal_vnd FROM order_items WHERE order_id=1"));
  reject("UPDATE order_items SET quantity=0 WHERE order_id=1");
  reject("UPDATE orders SET status='COMPLETED' WHERE id=1");
  sql("UPDATE products SET name='New coffee',price_vnd=60000 WHERE id=1");
  assertEquals(50000,number("SELECT unit_price_vnd FROM order_items WHERE order_id=1"));
  sql("INSERT INTO order_requests(creator_id,idempotency_key,request_hash,order_id) VALUES(2,'00000000-0000-0000-0000-000000000001',REPEAT('a',64),1)");
  reject("INSERT INTO order_requests(creator_id,idempotency_key,request_hash,order_id) VALUES(2,'00000000-0000-0000-0000-000000000002',REPEAT('a',64),2)");
  reject("INSERT INTO payments(order_id,method,amount_vnd) VALUES(1,'CASH',50001)");
  sql("INSERT INTO payments(order_id,method,amount_vnd) VALUES(1,'CASH',50000)");
  reject("UPDATE payments SET status='PAID' WHERE order_id=1");
  sql("UPDATE payments SET status='PAID',confirmed_by=1,confirmed_at=CURRENT_TIMESTAMP(6),confirmation_key='CASH-1' WHERE order_id=1");
  sql("UPDATE orders SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP(6) WHERE id=1");
  reject("INSERT INTO payments(order_id,method,amount_vnd) VALUES(1,'CASH',50000)");
  sql("INSERT INTO product_reviews(user_id,product_id,stars,comment) VALUES(2,1,5,'Good')");
  reject("INSERT INTO product_reviews(user_id,product_id,stars) VALUES(2,1,3)");
  reject("UPDATE product_reviews SET stars=6 WHERE user_id=2");
  sql("INSERT INTO review_moderation_events(review_id,actor_id,is_visible,reason,review_version) VALUES(1,1,0,'Moderation',1)");
  reject("DELETE FROM users WHERE id=2");reject("DELETE FROM products WHERE id=1");reject("DELETE FROM orders WHERE id=1");
  order(3,"ONLINE",2,"2","NULL");order(4,"ONLINE",2,"2","NULL");
  String payment="INSERT INTO payments(order_id,method,status,amount_vnd,bank_code,bank_account,bank_account_name,transfer_content,reference,confirmation_key,confirmed_by,confirmed_at) VALUES(%d,'QR_TRANSFER','PAID',50000,'BANK','0001','Shop','ORDER','REF','%s',1,CURRENT_TIMESTAMP(6))";
  sql(payment.formatted(3,"BANK-REF"));reject(payment.formatted(4,"DIFFERENT-KEY"));
 }
 @Test void recoveryAndKnowledgeEnforceVersionOwnershipAndState() throws Exception {
  flyway("latest").migrate();users();
  sql("INSERT INTO password_reset_challenges(challenge_id,user_id,code_hash,expires_at) VALUES('challenge-known',2,REPEAT('a',64),CURRENT_TIMESTAMP(6)+INTERVAL 10 MINUTE),('challenge-unknown',NULL,REPEAT('b',64),CURRENT_TIMESTAMP(6)+INTERVAL 10 MINUTE)");
  reject("UPDATE password_reset_challenges SET attempts=6 WHERE challenge_id='challenge-known'");
  reject("UPDATE password_reset_challenges SET expires_at=created_at WHERE challenge_id='challenge-known'");
  reject("UPDATE password_reset_challenges SET consumed_at=CURRENT_TIMESTAMP(6),invalidated_at=CURRENT_TIMESTAMP(6) WHERE challenge_id='challenge-known'");
  sql("INSERT INTO password_reset_limits(rate_key,window_start) VALUES(REPEAT('a',64),CURRENT_TIMESTAMP(6))");
  reject("UPDATE password_reset_limits SET request_count=-1");
  sql("INSERT INTO knowledge_documents(id,title,created_by) VALUES(1,'Policy',1),(2,'Menu',1)");
  for(int id=1;id<=2;id++)sql("INSERT INTO knowledge_versions(id,document_id,revision,original_filename,storage_path,content_type,file_size_bytes,content_hash,created_by) VALUES("+id+","+id+",1,'policy.txt','knowledge/file-"+id+"','text/plain',200,REPEAT('a',64),1)");
  reject("UPDATE knowledge_documents SET enabled=1 WHERE id=1");
  reject("UPDATE knowledge_documents SET active_version_id=2 WHERE id=1");
  reject("UPDATE knowledge_versions SET status='READY',embedding_model='test',indexed_at=CURRENT_TIMESTAMP(6) WHERE id=1");
  sql("UPDATE knowledge_versions SET status='READY',embedding_model='test',embedding_dimensions=2,indexed_at=CURRENT_TIMESTAMP(6) WHERE id=1");
  sql("UPDATE knowledge_documents SET active_version_id=1,enabled=1 WHERE id=1");
  String chunk="INSERT INTO knowledge_chunks(document_id,version_id,ordinal,content,token_count,embedding,embedding_dimensions) VALUES(1,1,%d,'Policy text',2,'%s',2)";
  reject("INSERT INTO knowledge_chunks(document_id,version_id,ordinal,content,token_count,embedding,embedding_dimensions) VALUES(1,1,0,'wrong dimensions',1,'[1]',1)");
  sql(chunk.formatted(0,"[0.1,0.2]"));reject(chunk.formatted(1,"[0.1]"));reject(chunk.formatted(1,"[1,{}]"));
  reject("INSERT INTO knowledge_chunks(document_id,version_id,ordinal,content,token_count,embedding,embedding_dimensions) VALUES(1,2,0,'wrong owner',1,'[1]',1)");
  sql("INSERT INTO knowledge_ingestion_jobs(version_id) VALUES(1)");
  reject("UPDATE knowledge_ingestion_jobs SET status='PROCESSING' WHERE version_id=1");
  sql("UPDATE knowledge_ingestion_jobs SET status='PROCESSING',attempts=1,worker_id='worker',lease_expires_at=CURRENT_TIMESTAMP(6)+INTERVAL 1 MINUTE WHERE version_id=1");
  reject("UPDATE knowledge_ingestion_jobs SET attempts=4 WHERE version_id=1");
  reject("UPDATE knowledge_documents SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=1");
  sql("UPDATE knowledge_documents SET enabled=0,deleted_at=CURRENT_TIMESTAMP(6) WHERE id=1");
  reject("INSERT INTO knowledge_audit(document_id,version_id,actor_id,action) VALUES(1,2,1,'ENABLE')");
 }
}
