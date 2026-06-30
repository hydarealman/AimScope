package com.aimscope.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class InfluxDBConfig {

    @Value("${influxdb.url}")
    private String url;

    @Value("${influxdb.token}")
    private String token;

    @Value("${influxdb.org}")
    private String org;

    @Value("${influxdb.bucket}")
    private String bucket;

    @Bean
    public com.influxdb.client.InfluxDBClient influxDBClient() {
        return com.influxdb.client.InfluxDBClientFactory.create(url, token.toCharArray(), org, bucket);
    }

    public String getOrg() { return org; }
    public String getBucket() { return bucket; }
}
