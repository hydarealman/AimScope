package com.aimscope.controller;

import com.aimscope.service.ReplayService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/replay")
public class ReplayController {

    private final ReplayService replayService;

    public ReplayController(ReplayService replayService) {
        this.replayService = replayService;
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<Map<String, Object>>> list() {
        return ResponseEntity.ok(replayService.listSessions());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable Long id) {
        return ResponseEntity.ok(replayService.getSession(id));
    }

    @PostMapping("/upload")
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file) {
        try {
            Map<String, Object> result = replayService.uploadFile(file);
            return ResponseEntity.ok(result);
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Upload failed: " + e.getMessage()));
        }
    }

    @GetMapping("/{id}/data")
    public ResponseEntity<List<Map<String, Object>>> queryData(
            @PathVariable Long id,
            @RequestParam String topic,
            @RequestParam(defaultValue = "0") long from,
            @RequestParam(defaultValue = "5000") long to) {
        return ResponseEntity.ok(replayService.queryData(id, topic, from, to));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        replayService.deleteSession(id);
        return ResponseEntity.ok(Map.of("status", "deleted"));
    }
}
