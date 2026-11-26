FROM eclipse-temurin:21-jdk AS backend-build
WORKDIR /build
COPY backend/ ./
RUN sh mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre AS api
WORKDIR /app
COPY --from=backend-build /build/target/tu-coffee-api-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]

FROM node:24-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine AS web
COPY deploy/web.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /build/dist/*/browser/ /usr/share/nginx/html/
