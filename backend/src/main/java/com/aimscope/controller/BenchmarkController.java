package com.aimscope.controller;

import com.aimscope.dto.BenchmarkRequest;
import com.aimscope.model.entity.BenchmarkRun;
import com.aimscope.service.BenchmarkService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/benchmark")
public class BenchmarkController {

    private final BenchmarkService benchmarkService;

    public BenchmarkController(BenchmarkService benchmarkService) {
        this.benchmarkService = benchmarkService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list() {
        return ResponseEntity.ok(benchmarkService.listRuns());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable Long id) {
        return ResponseEntity.ok(benchmarkService.getRun(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody BenchmarkRequest request) {
        try {
            BenchmarkRun run = benchmarkService.createRun(request);
            return ResponseEntity.ok(Map.of(
                    "id", run.getId(),
                    "status", run.getStatus().name(),
                    "message", "Benchmark started"
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
