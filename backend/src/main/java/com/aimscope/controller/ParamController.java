package com.aimscope.controller;

import com.aimscope.dto.ParamUpdateRequest;
import com.aimscope.security.JwtUtil;
import com.aimscope.service.ParamService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/params")
public class ParamController {

    private final ParamService paramService;
    private final JwtUtil jwtUtil;

    public ParamController(ParamService paramService, JwtUtil jwtUtil) {
        this.paramService = paramService;
        this.jwtUtil = jwtUtil;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list() {
        return ResponseEntity.ok(paramService.listConfigs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable Long id) {
        return ResponseEntity.ok(paramService.getConfig(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body,
                                     @RequestHeader("Authorization") String auth) {
        try {
            Long userId = jwtUtil.getUserId(auth.substring(7));
            String name = (String) body.get("name");
            String description = (String) body.getOrDefault("description", "");
            String fileType = (String) body.getOrDefault("fileType", "YAML");
            String content = (String) body.getOrDefault("content", "# Empty config\n");
            return ResponseEntity.ok(paramService.createConfig(name, description, fileType, content, userId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                     @Valid @RequestBody ParamUpdateRequest request,
                                     @RequestHeader("Authorization") String auth) {
        try {
            Long userId = jwtUtil.getUserId(auth.substring(7));
            return ResponseEntity.ok(paramService.updateConfig(id, request, userId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/versions")
    public ResponseEntity<List<Map<String, Object>>> versions(@PathVariable Long id) {
        return ResponseEntity.ok(paramService.getVersions(id));
    }

    @GetMapping("/{id}/versions/{vid}")
    public ResponseEntity<Map<String, Object>> getVersion(@PathVariable Long id, @PathVariable Integer vid) {
        return ResponseEntity.ok(paramService.getVersion(id, vid));
    }

    @PostMapping("/{id}/rollback/{vid}")
    public ResponseEntity<?> rollback(@PathVariable Long id, @PathVariable Integer vid,
                                       @RequestHeader("Authorization") String auth) {
        try {
            Long userId = jwtUtil.getUserId(auth.substring(7));
            return ResponseEntity.ok(paramService.rollback(id, vid, userId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/diff")
    public ResponseEntity<Map<String, String>> diff(@PathVariable Long id,
                                                     @RequestParam int v1, @RequestParam int v2) {
        String diff = paramService.diff(id, v1, v2);
        return ResponseEntity.ok(Map.of("diff", diff));
    }
}
