package com.aimscope;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class AimScopeApplication {
    public static void main(String[] args) {
        SpringApplication.run(AimScopeApplication.class, args);
    }
}
