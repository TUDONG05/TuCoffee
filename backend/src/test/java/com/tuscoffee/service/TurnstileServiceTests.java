package com.tuscoffee.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.net.http.*;
import java.io.IOException;
import com.tuscoffee.exception.ApiException;
import org.junit.jupiter.api.Test;
class TurnstileServiceTests {
 private final HttpClient http = mock(HttpClient.class);
 private TurnstileService service(boolean enabled) { return new TurnstileService(enabled,"public-key","private-key","localhost",http); }
 @SuppressWarnings("unchecked") private void response(String body) throws Exception {
  HttpResponse<String> response=mock(HttpResponse.class);
  when(response.statusCode()).thenReturn(200); when(response.body()).thenReturn(body);
  when(http.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
 }
 @Test void disabledDoesNotCallProvider(){service(false).verify(null,"login");verifyNoInteractions(http);}
 @Test void missingOrHugeTokenRejectedBeforeNetwork(){
  assertEquals("TURNSTILE_REQUIRED",assertThrows(ApiException.class,()->service(true).verify(null,"login")).code());
  assertEquals("TURNSTILE_INVALID",assertThrows(ApiException.class,()->service(true).verify("x".repeat(2049),"login")).code());verifyNoInteractions(http);
 }
 @Test void successfulMatchingActionAndHostname() throws Exception {
  response("{\"success\":true,\"action\":\"login\",\"hostname\":\"localhost\"}");
  service(true).verify("token","login");
 }
 @Test void rejectsFailureReplayActionOrHostnameMismatch() throws Exception {
  for(String body:new String[]{"{\"success\":false}","{\"success\":true,\"action\":\"register\",\"hostname\":\"localhost\"}","{\"success\":true,\"action\":\"login\",\"hostname\":\"evil.test\"}"}){
   response(body);assertEquals("TURNSTILE_INVALID",assertThrows(ApiException.class,()->service(true).verify("token","login")).code());
  }
 }
 @Test void networkFailureFailsClosed() throws Exception {
  when(http.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenThrow(new IOException());
  assertEquals(503,assertThrows(ApiException.class,()->service(true).verify("token","login")).status());
 }
 @Test void enabledRequiresConfiguration(){assertThrows(IllegalStateException.class,()->new TurnstileService(true,"","","",http));}
}
